import { routes } from "../routes.ts";

export async function createOpenApiDocument() {
  const pathEntries = await Promise.all(
    routes.map(async (route) => {
      const controllerModule = await route.controller;
      const controller = controllerModule.default;
      const openApiPath = route.pathname.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");
      return {
        openApiPath,
        method: route.method.toLowerCase(),
        operation: controller.openapi,
      };
    }),
  );

  const paths: Record<string, Record<string, unknown>> = {};
  for (const entry of pathEntries) {
    if (!paths[entry.openApiPath]) {
      paths[entry.openApiPath] = {};
    }
    paths[entry.openApiPath][entry.method] = entry.operation;
  }

  return {
    openapi: "3.0.0",
    info: {
      title: "Todo API Example",
      version: "1.0.0",
    },
    paths,
  };
}
