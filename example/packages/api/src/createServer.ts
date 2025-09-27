import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { URL } from "node:url";
import type { z } from "zod/v4";
import { createConfig } from "./config.js";
import { controller as healthController } from "./controllers/health/get.js";
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
  ServerLifecycle,
} from "./types.js";
import { sendJson } from "./utils/http.js";
import { createOpenApiController } from "./utils/openapi.js";

const documentedControllers = [
  listNotesController,
  createNoteController,
  getNoteController,
] satisfies readonly ControllerDefinition<ControllerSchema>[];

type ZodObjectSchema = z.ZodObject<Record<string, z.ZodTypeAny>>;

type InferParams<TSchema extends ControllerSchema> =
  TSchema["params"] extends ZodObjectSchema
    ? z.infer<TSchema["params"]>
    : Record<string, never>;

type InferQuery<TSchema extends ControllerSchema> =
  TSchema["query"] extends ZodObjectSchema
    ? z.infer<TSchema["query"]>
    : Record<string, never>;

function toUrlPatternPath(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ":$1");
}

function normalizeRequestUrl(request: IncomingMessage, config: Config): URL {
  const origin = request.headers.host
    ? `http://${request.headers.host}`
    : `http://${config.host}:${config.port}`;
  return new URL(request.url ?? "/", origin);
}

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

export function createServer(options?: {
  config?: Config;
  contextFactory?: (configuration: Config) => Promise<AppContext>;
}): ServerLifecycle {
  const config = options?.config ?? createConfig();
  const contextFactory =
    options?.contextFactory ??
    ((configuration) => buildContext({ config: configuration }));

  const controllers: ControllerDefinition<ControllerSchema>[] = [
    healthController,
    ...documentedControllers,
    createOpenApiController(documentedControllers),
  ];

  const routes = controllers.map((controller) => ({
    method: controller.schema.method,
    pattern: new URLPattern({
      pathname: toUrlPatternPath(controller.schema.path),
    }),
    controller,
  }));

  const httpServer = createHttpServer((nodeRequest, nodeResponse) => {
    handleRequest(nodeRequest, nodeResponse).catch((error) => {
      context?.logger.error("Request lifecycle failure", { error });
      sendJson(nodeResponse, 500, {
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      });
    });
  });

  let context: AppContext | null = null;

  async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ) {
    if (!request.method || !request.url) {
      response.writeHead(400);
      response.end();
      return;
    }

    const url = normalizeRequestUrl(request, config);
    let matchedController: {
      controller: ControllerDefinition<ControllerSchema>;
      match: URLPatternResult;
    } | null = null;

    for (const route of routes) {
      if (route.method !== request.method) {
        continue;
      }

      const matchResult = route.pattern.exec(url);
      if (matchResult) {
        matchedController = {
          controller: route.controller,
          match: matchResult,
        };
        break;
      }
    }

    if (!matchedController) {
      response.writeHead(404);
      response.end();
      return;
    }

    const activeContext = context;
    if (!activeContext) {
      response.writeHead(503);
      response.end();
      return;
    }

    try {
      const params = parseParams(
        matchedController.controller,
        matchedController.match,
      );
      const query = parseQuery(matchedController.controller, url);
      await matchedController.controller.handler({
        context: activeContext,
        request,
        response,
        params,
        query,
      });
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
    if (httpServer.listening) {
      return;
    }

    context = await contextFactory(config);

    await new Promise<void>((resolve) => {
      httpServer.listen(config.port, config.host, resolve);
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
    if (!httpServer.listening) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

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
