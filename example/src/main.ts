import { loadConfig } from "./config.ts";
import createServer from "./createServer.ts";

async function main() {
  const config = loadConfig(process.env);
  const app = createServer(config);

  await app.start();
  console.log(`Todo API listening on ${config.publicBaseUrl}`);

  const shutdown = async () => {
    await app.stop();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(String(error));
  }
  process.exit(1);
});
