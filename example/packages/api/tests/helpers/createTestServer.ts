import { createServer } from "../../src/createServer.js";
import type { Config, ServerLifecycle } from "../../src/types.js";

type TestServer = {
  server: ServerLifecycle;
  baseUrl: string;
};

export async function createTestServer(
  overrides?: Partial<Config>,
): Promise<TestServer> {
  const config: Config = {
    host: overrides?.host ?? "127.0.0.1",
    port: overrides?.port ?? 0,
  };

  const server = createServer({ config });
  await server.start();

  const httpServer = server.getServers().http;
  if (!httpServer) {
    throw new Error("HTTP server not available");
  }

  const address = httpServer.address();
  if (address === null) {
    throw new Error("Server did not report an address");
  }

  if (typeof address === "string") {
    return {
      server,
      baseUrl: address,
    };
  }

  const hostname = address.address === "::" ? "127.0.0.1" : address.address;
  return {
    server,
    baseUrl: `http://${hostname}:${address.port}`,
  };
}
