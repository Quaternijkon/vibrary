import dgram from "node:dgram";
import os from "node:os";

export const DISCOVERY_PORT = 8766;
const DISCOVERY_INTERVAL_MS = 2000;

export type DiscoveryMessageInput = {
  instanceId: string;
  deviceName: string;
  serverUrl: string;
};

export function buildDiscoveryMessage(input: DiscoveryMessageInput): string {
  return JSON.stringify({
    type: "vibrary-desktop",
    version: 1,
    instance_id: input.instanceId,
    device_name: input.deviceName,
    server_url: input.serverUrl,
    pairing_path: "/v1/pairing/claim"
  });
}

export class LanDiscoveryBroadcaster {
  private socket: dgram.Socket | null = null;
  private timer: NodeJS.Timeout | null = null;
  private currentMessage: string | null = null;

  start(input: DiscoveryMessageInput): void {
    this.stop();
    this.currentMessage = buildDiscoveryMessage(input);
    this.socket = dgram.createSocket("udp4");
    this.socket.bind(() => {
      this.socket?.setBroadcast(true);
      this.broadcast();
      this.timer = setInterval(() => this.broadcast(), DISCOVERY_INTERVAL_MS);
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.currentMessage = null;
  }

  status(): { running: boolean; port: number } {
    return { running: this.socket !== null, port: DISCOVERY_PORT };
  }

  private broadcast(): void {
    if (!this.socket || !this.currentMessage) {
      return;
    }
    const payload = Buffer.from(this.currentMessage, "utf8");
    this.socket.send(payload, DISCOVERY_PORT, "255.255.255.255");
    for (const address of localBroadcastAddresses(os.networkInterfaces())) {
      this.socket.send(payload, DISCOVERY_PORT, address);
    }
  }
}

function localBroadcastAddresses(interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal || !entry.netmask) {
        continue;
      }
      addresses.push(toBroadcastAddress(entry.address, entry.netmask));
    }
  }
  return [...new Set(addresses)];
}

function toBroadcastAddress(address: string, netmask: string): string {
  const ip = address.split(".").map(Number);
  const mask = netmask.split(".").map(Number);
  return ip.map((part, index) => (part | (~mask[index] & 255)) & 255).join(".");
}
