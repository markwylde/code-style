import type { IncomingMessage, ServerResponse } from "node:http";
import type { z } from "zod/v4";
import { ValidationError } from "../errors.js";
import type { ControllerSchema } from "../types.js";

type ZodObjectSchema = z.ZodObject<Record<string, z.ZodTypeAny>>;
type ControllerWithBody = ControllerSchema<
  ZodObjectSchema | undefined,
  ZodObjectSchema | undefined,
  { contentType: string; schema: z.ZodTypeAny }
>;

export async function readBody(request: IncomingMessage): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

export function parseJsonSafely(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    throw new ValidationError("Invalid JSON payload", null);
  }
}

export async function getBodyFromRequest<TSchema extends ControllerWithBody>(
  request: IncomingMessage,
  schema: TSchema,
): Promise<z.output<NonNullable<TSchema["body"]>["schema"]>> {
  const bodyDefinition = schema.body;
  if (!bodyDefinition) {
    throw new ValidationError("Controller schema does not define a body", null);
  }

  if (!request.headers["content-type"]?.includes(bodyDefinition.contentType)) {
    throw new ValidationError(
      `Unsupported content type. Expected ${bodyDefinition.contentType}`,
      null,
    );
  }

  const rawBody = await readBody(request);
  if (rawBody.length === 0) {
    throw new ValidationError("Request body is required", null);
  }

  const parsed = parseJsonSafely(rawBody);
  const bodySchema = bodyDefinition.schema as NonNullable<
    TSchema["body"]
  >["schema"];
  const result = bodySchema.safeParse(parsed);
  if (!result.success) {
    throw new ValidationError("Invalid request body", result.error.format());
  }

  return result.data as z.output<NonNullable<TSchema["body"]>["schema"]>;
}

export function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  const body = JSON.stringify(payload);
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", Buffer.byteLength(body));
  response.end(body);
}

export function sendNoContent(response: ServerResponse): void {
  response.statusCode = 204;
  response.end();
}
