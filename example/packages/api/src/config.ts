import type { Config } from "./types.js";

export function createConfig(overrides?: Partial<Config>): Config {
  const port =
    overrides?.port ?? Number.parseInt(process.env.PORT ?? "4000", 10);
  const host = overrides?.host ?? process.env.HOST ?? "127.0.0.1";

  return {
    host,
    port,
  };
}
