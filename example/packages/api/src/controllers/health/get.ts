import { z } from "zod/v4";
import type {
  ControllerDefinition,
  ControllerSchema,
  Handler,
} from "../../types.js";
import { sendJson } from "../../utils/http.js";

export const schema = {
  method: "GET",
  path: "/health",
  summary: "Readiness probe",
  tags: ["Health"] as const,
  responses: {
    200: {
      description: "Service is healthy",
      content: {
        "application/json": {
          schema: z.object({ status: z.literal("healthy") }),
        },
      },
    },
  },
} as const satisfies ControllerSchema;

type Schema = typeof schema;

export const handler: Handler<Schema> = async ({ response }) => {
  sendJson(response, 200, { status: "healthy" });
};

export const controller: ControllerDefinition<Schema> = {
  schema,
  handler,
};
