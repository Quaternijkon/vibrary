import { describe, expect, it, vi } from "vitest";
import { findAvailableTcpPort } from "../ports";

describe("findAvailableTcpPort", () => {
  it("uses the preferred port when it is available", async () => {
    const checker = vi.fn(async () => true);

    await expect(findAvailableTcpPort("127.0.0.1", 6333, 3, checker)).resolves.toBe(6333);

    expect(checker).toHaveBeenCalledWith("127.0.0.1", 6333);
  });

  it("falls forward to the next available local port", async () => {
    const checker = vi.fn(async (_host: string, port: number) => port === 6335);

    await expect(findAvailableTcpPort("127.0.0.1", 6333, 5, checker)).resolves.toBe(6335);

    expect(checker).toHaveBeenCalledTimes(3);
  });

  it("fails clearly when no candidate port is available", async () => {
    const checker = vi.fn(async () => false);

    await expect(findAvailableTcpPort("127.0.0.1", 6333, 2, checker)).rejects.toThrow(
      "No available TCP port found"
    );
  });
});
