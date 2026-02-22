import type http from "node:http";
import { ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";

type BodyMode = "text" | "json";

type BodyOptions = {
  maxBytes?: number;
};

export async function getBodyFromRequest(
  context: Context,
  request: http.IncomingMessage,
  mode: BodyMode,
  options: BodyOptions = {},
): Promise<unknown> {
  const maxBytes = options.maxBytes ?? context.config.maxBodyBytes;
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const bufferChunk = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    totalBytes += bufferChunk.length;

    if (totalBytes > maxBytes) {
      throw new ValidationError("Request body too large");
    }

    chunks.push(bufferChunk);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const text = Buffer.concat(chunks).toString("utf8");

  if (mode === "text") {
    return text;
  }

  if (text.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError("Invalid JSON body");
  }
}
