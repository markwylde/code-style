import type { Config } from "../types.ts";

export async function waitForHealth(config: Config): Promise<void> {
  const healthUrl = new URL("/health", config.publicBaseUrl);
  const maxAttempts = 40;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(healthUrl, { method: "GET" });
      if (response.ok) {
        return;
      }
    } catch {}

    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });
  }

  throw new Error("Health check failed after retries");
}
