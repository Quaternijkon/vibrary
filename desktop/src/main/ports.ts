import net from "node:net";

export type PortAvailabilityChecker = (host: string, port: number) => Promise<boolean>;

export async function findAvailableTcpPort(
  host: string,
  preferredPort: number,
  attempts: number,
  checker: PortAvailabilityChecker = isTcpPortAvailable
): Promise<number> {
  for (let offset = 0; offset < attempts; offset += 1) {
    const candidate = preferredPort + offset;
    if (await checker(host, candidate)) {
      return candidate;
    }
  }
  throw new Error(`No available TCP port found from ${preferredPort} to ${preferredPort + attempts - 1}`);
}

async function isTcpPortAvailable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host, port }, () => {
      server.close(() => resolve(true));
    });
  });
}
