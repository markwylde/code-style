import { toJSONSchema, z } from "zod/v4";
import type {
  Config,
  ControllerDefinition,
  ControllerSchema,
} from "../types.js";
import { sendJson } from "./http.js";

function buildOpenApiOperation(
  controller: ControllerDefinition<ControllerSchema>,
) {
  const { schema } = controller;
  const parameters: Array<Record<string, unknown>> = [];

  if (schema.params) {
    const entries = Object.entries(schema.params.shape) as Array<
      [string, z.ZodTypeAny]
    >;
    for (const [name, definition] of entries) {
      parameters.push({
        name,
        in: "path",
        required: true,
        schema: toJSONSchema(definition),
      });
    }
  }

  if (schema.query) {
    const entries = Object.entries(schema.query.shape) as Array<
      [string, z.ZodTypeAny & { isOptional?: () => boolean }]
    >;
    for (const [name, definition] of entries) {
      const typed = definition;
      parameters.push({
        name,
        in: "query",
        required: !(
          typeof typed.isOptional === "function" && typed.isOptional()
        ),
        schema: toJSONSchema(typed),
      });
    }
  }

  const responses = Object.fromEntries(
    Object.entries(schema.responses).map(([status, response]) => {
      const jsonContent = response.content?.["application/json"];
      return [
        status,
        {
          description: response.description,
          ...(jsonContent
            ? {
                content: {
                  "application/json": {
                    schema: toJSONSchema(jsonContent.schema),
                  },
                },
              }
            : {}),
        },
      ];
    }),
  );

  const requestBody = schema.body
    ? {
        required: true,
        content: {
          [schema.body.contentType]: {
            schema: toJSONSchema(schema.body.schema as z.ZodTypeAny),
          },
        },
      }
    : undefined;

  return {
    summary: schema.summary,
    description: schema.description,
    tags: schema.tags,
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(requestBody ? { requestBody } : {}),
    responses,
  };
}

function generateOpenApiDocument(
  config: Config,
  controllers: readonly ControllerDefinition<ControllerSchema>[],
) {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const controller of controllers) {
    const method = controller.schema.method.toLowerCase();
    let pathItem = paths[controller.schema.path];
    if (!pathItem) {
      pathItem = {};
      paths[controller.schema.path] = pathItem;
    }
    pathItem[method] = buildOpenApiOperation(controller);
  }

  return {
    openapi: "3.1.0",
    info: {
      version: "0.0.0",
      title: "Notes API",
      description: "Example implementation for the NodeJS Code Guide",
    },
    servers: [{ url: `http://${config.host}:${config.port}` }],
    paths,
  };
}

export function createOpenApiController(
  controllers: readonly ControllerDefinition<ControllerSchema>[],
): ControllerDefinition<ControllerSchema> {
  const schema: ControllerSchema = {
    method: "GET",
    path: "/openapi",
    summary: "OpenAPI document",
    tags: ["Documentation"],
    responses: {
      200: {
        description: "Generated OpenAPI document",
        content: {
          "application/json": {
            schema: z.object({}).passthrough(),
          },
        },
      },
    },
  };

  return {
    schema,
    handler: async ({ context, response }) => {
      const document = generateOpenApiDocument(context.config, controllers);
      sendJson(response, 200, document);
    },
  };
}
