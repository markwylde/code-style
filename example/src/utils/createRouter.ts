import type http from "node:http";
import { z } from "zod";
import type { Context, Route } from "../types.ts";
import { handleHttpError, sendJson } from "./http.ts";

export async function createRouter(
  context: Context,
  routes: Route[],
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  try {
    if (!request.url) {
      sendJson(response, 400, {
        error: "Invalid request URL",
        code: "INVALID_REQUEST",
      });
      return;
    }

    const url = new URL(request.url, context.config.publicBaseUrl);

    for (const route of routes) {
      if (route.method !== request.method) {
        continue;
      }

      const match = route.pattern.exec({ pathname: url.pathname });
      if (!match) {
        continue;
      }

      const controllerModule = await route.controller;
      const controller = controllerModule.default;
      const schema = controller.schema;
      const params = schema?.params
        ? z
            .any()
            .pipe(schema.params as z.ZodTypeAny)
            .parse(match.pathname.groups ?? {})
        : {};
      const query = schema?.query
        ? z
            .any()
            .pipe(schema.query as z.ZodTypeAny)
            .parse(Object.fromEntries(url.searchParams.entries()))
        : {};

      await controller.handler({
        context,
        request,
        response,
        params,
        query,
      });
      return;
    }

    sendJson(response, 404, { error: "Not found", code: "NOT_FOUND" });
  } catch (error) {
    handleHttpError(response, error);
  }
}
