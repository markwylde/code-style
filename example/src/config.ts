import { z } from "zod";
import type { Config } from "./types.ts";

const ConfigSchema = z.object({
  TODO_API_PORT: z.coerce.number().int().min(1).max(65535),
  TODO_API_PUBLIC_BASE_URL: z.string().url(),
  TODO_API_MAX_BODY_BYTES: z.coerce.number().int().positive(),
});

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = ConfigSchema.parse({
    TODO_API_PORT: env.TODO_API_PORT,
    TODO_API_PUBLIC_BASE_URL: env.TODO_API_PUBLIC_BASE_URL,
    TODO_API_MAX_BODY_BYTES: env.TODO_API_MAX_BODY_BYTES,
  });

  return {
    todoApiPort: parsed.TODO_API_PORT,
    publicBaseUrl: parsed.TODO_API_PUBLIC_BASE_URL,
    maxBodyBytes: parsed.TODO_API_MAX_BODY_BYTES,
  };
}
