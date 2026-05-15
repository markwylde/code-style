import type http from "node:http";
import { z } from "zod";
import { AppError } from "../errors.ts";

export function sendJson(
  response: http.ServerResponse,
  statusCode: number,
  data: unknown,
): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(data));
}

export function handleHttpError(
  response: http.ServerResponse,
  error: unknown,
): void {
  if (error instanceof z.ZodError) {
    sendJson(response, 400, {
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: error.issues,
    });
    return;
  }

  if (error instanceof AppError) {
    sendJson(response, error.statusCode, {
      error: error.message,
      code: error.code,
    });
    return;
  }

  sendJson(response, 500, {
    error: "Internal server error",
    code: "INTERNAL_SERVER_ERROR",
  });
}
