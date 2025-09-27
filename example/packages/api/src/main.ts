import { createConfig } from "./config.js";
import { createServer } from "./createServer.js";

async function main() {
  const config = createConfig();
  const server = createServer({ config });
  await server.start();
  const context = server.getContext();
  context.logger.info("Notes API ready", {
    host: config.host,
    port: config.port,
  });
}

main().catch((error) => {
  console.error("Failed to start server", error);
  process.exitCode = 1;
});
