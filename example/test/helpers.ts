import type { AppServer } from "../src/createServer.ts";
import { createServer } from "../src/createServer.ts";
import net from "node:net";
import type { Config } from "../src/types.ts";

export async function createTestServer(
  port?: number,
): Promise<{ app: AppServer; config: Config; port: number }> {
  const selectedPort = port ?? (await getAvailablePort());
  const config: Config = {
    todoApiPort: selectedPort,
    publicBaseUrl: `http://127.0.0.1:${selectedPort}`,
    maxBodyBytes: 102400,
  };

  const app = createServer(config);
  await app.start();
  return { app, config, port: selectedPort };
}

async function getAvailablePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not determine ephemeral test port");
  }

  const { port } = address;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  return port;
}
