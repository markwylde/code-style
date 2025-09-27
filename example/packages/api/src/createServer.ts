import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { URL } from "node:url";
import { toJSONSchema, z } from "zod/v4";
import { createConfig } from "./config.js";
import { controller as getNoteController } from "./controllers/notes/[noteId]/get.js";
import { controller as listNotesController } from "./controllers/notes/get.js";
import { controller as createNoteController } from "./controllers/notes/post.js";
import { createContext as buildContext } from "./createContext.js";
import { ApplicationError, ValidationError } from "./errors.js";
import type {
  AppContext,
  Config,
  ControllerDefinition,
  ControllerSchema,
  Route,
  ServerLifecycle,
} from "./types.js";
import { sendJson } from "./utils/http.js";

const documentedControllers = [
  listNotesController,
  createNoteController,
  getNoteController,
] satisfies readonly ControllerDefinition<ControllerSchema>[];

type ZodObjectSchema = z.ZodObject<Record<string, z.ZodTypeAny>>;

function createHealthController(): ControllerDefinition<ControllerSchema> {
  const schema: ControllerSchema = {
    method: "GET",
    path: "/health",
    summary: "Readiness probe",
    tags: ["Health"],
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
  };

  return {
    schema,
    handler: async ({ response }) => {
      sendJson(response, 200, { status: "healthy" });
    },
  };
}

function createOpenApiController(
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

function buildRoutes(
  controllers: readonly ControllerDefinition<ControllerSchema>[],
): Route[] {
  return controllers.map((controller) => ({
    method: controller.schema.method,
    pattern: new URLPattern({
      pathname: toUrlPatternPath(controller.schema.path),
    }),
    controller,
  }));
}

function toUrlPatternPath(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ":$1");
}

function normalizeRequestUrl(request: IncomingMessage, config: Config): URL {
  const origin = request.headers.host
    ? `http://${request.headers.host}`
    : `http://${config.host}:${config.port}`;
  return new URL(request.url ?? "/", origin);
}

type InferParams<TSchema extends ControllerSchema> =
  TSchema["params"] extends ZodObjectSchema
    ? z.infer<TSchema["params"]>
    : Record<string, never>;

type InferQuery<TSchema extends ControllerSchema> =
  TSchema["query"] extends ZodObjectSchema
    ? z.infer<TSchema["query"]>
    : Record<string, never>;

function parseParams<TSchema extends ControllerSchema>(
  controller: ControllerDefinition<TSchema>,
  match: URLPatternResult,
): InferParams<TSchema> {
  const paramsSchema = controller.schema.params;
  if (!paramsSchema) {
    return {} as InferParams<TSchema>;
  }

  const result = paramsSchema.safeParse(match.pathname.groups);
  if (!result.success) {
    throw new ValidationError(
      "Invalid request parameters",
      result.error.format(),
    );
  }

  return result.data as InferParams<TSchema>;
}

function parseQuery<TSchema extends ControllerSchema>(
  controller: ControllerDefinition<TSchema>,
  url: URL,
): InferQuery<TSchema> {
  const querySchema = controller.schema.query;
  if (!querySchema) {
    return {} as InferQuery<TSchema>;
  }

  const queryObject = Object.fromEntries(url.searchParams.entries());
  const result = querySchema.safeParse(queryObject);
  if (!result.success) {
    throw new ValidationError(
      "Invalid query parameters",
      result.error.format(),
    );
  }

  return result.data as InferQuery<TSchema>;
}

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

async function handleController<TSchema extends ControllerSchema>(
  controller: ControllerDefinition<TSchema>,
  context: AppContext,
  request: IncomingMessage,
  response: ServerResponse,
  matchResult: URLPatternResult,
  url: URL,
) {
  const params = parseParams(controller, matchResult);
  const query = parseQuery(controller, url);

  await controller.handler({ context, request, response, params, query });
}

export function createServer(options?: {
  config?: Config;
  contextFactory?: (configuration: Config) => Promise<AppContext>;
}): ServerLifecycle {
  const config = options?.config ?? createConfig();
  const contextFactory =
    options?.contextFactory ??
    ((configuration) => buildContext({ config: configuration }));

  const healthController = createHealthController();
  const openApiController = createOpenApiController(documentedControllers);

  const routes: Route[] = buildRoutes([
    healthController,
    ...documentedControllers,
    openApiController,
  ]);

  let context: AppContext | null = null;
  let httpServer: ReturnType<typeof createHttpServer> | null = null;

  async function ensureContext(): Promise<AppContext> {
    if (!context) {
      context = await contextFactory(config);
    }

    return context;
  }

  async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ) {
    if (!request.method || !request.url) {
      response.writeHead(400);
      response.end();
      return;
    }

    const activeContext = await ensureContext();
    const url = normalizeRequestUrl(request, config);
    const route = routes.find(
      (candidate) =>
        candidate.method === request.method && candidate.pattern.test(url),
    );

    if (!route) {
      response.writeHead(404);
      response.end();
      return;
    }

    const matchResult = route.pattern.exec(url);
    if (!matchResult) {
      response.writeHead(404);
      response.end();
      return;
    }

    const controller = route.controller;

    try {
      await handleController(
        controller,
        activeContext,
        request,
        response,
        matchResult,
        url,
      );
    } catch (error) {
      if (error instanceof ValidationError) {
        sendJson(response, error.statusCode, {
          error: error.message,
          code: error.code,
          details: error.details,
        });
        return;
      }

      if (error instanceof ApplicationError) {
        sendJson(response, error.statusCode, {
          error: error.message,
          code: error.code,
        });
        return;
      }

      activeContext.logger.error("Unexpected error", { error });
      sendJson(response, 500, {
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      });
    }
  }

  async function start() {
    if (httpServer) {
      return;
    }

    context = await contextFactory(config);
    httpServer = createHttpServer((nodeRequest, nodeResponse) => {
      handleRequest(nodeRequest, nodeResponse).catch((error) => {
        context?.logger.error("Request lifecycle failure", { error });
        sendJson(nodeResponse, 500, {
          error: "Internal server error",
          code: "INTERNAL_ERROR",
        });
      });
    });

    const activeServer = httpServer;
    if (!activeServer) {
      throw new Error("HTTP server failed to initialize");
    }

    await new Promise<void>((resolve) => {
      activeServer.listen(config.port, config.host, resolve);
    });

    const address = httpServer.address();
    if (address && typeof address === "object") {
      config.port = address.port;
      if (address.address && address.address !== "::") {
        config.host = address.address;
      }
    }
  }

  async function stop() {
    if (!httpServer) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      httpServer?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    httpServer = null;
    context = null;
  }

  async function restart() {
    await stop();
    await start();
  }

  function getContext() {
    if (!context) {
      throw new Error("Server has not been started");
    }

    return context;
  }

  function getServers() {
    return { http: httpServer };
  }

  return {
    start,
    stop,
    restart,
    getContext,
    getServers,
  };
}
