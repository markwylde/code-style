import type { Route } from "./types.ts";

export const routes: Route[] = [
  {
    method: "GET",
    pathname: "/health",
    pattern: new URLPattern({ pathname: "/health" }),
    controller: import("./controllers/health/get.ts"),
  },
  {
    method: "GET",
    pathname: "/openapi.json",
    pattern: new URLPattern({ pathname: "/openapi.json" }),
    controller: import("./controllers/openapi/get.ts"),
  },
  {
    method: "GET",
    pathname: "/todos",
    pattern: new URLPattern({ pathname: "/todos" }),
    controller: import("./controllers/todos/get.ts"),
  },
  {
    method: "POST",
    pathname: "/todos",
    pattern: new URLPattern({ pathname: "/todos" }),
    controller: import("./controllers/todos/post.ts"),
  },
  {
    method: "GET",
    pathname: "/todos/:todoId",
    pattern: new URLPattern({ pathname: "/todos/:todoId" }),
    controller: import("./controllers/todos/[todoId]/get.ts"),
  },
  {
    method: "PUT",
    pathname: "/todos/:todoId",
    pattern: new URLPattern({ pathname: "/todos/:todoId" }),
    controller: import("./controllers/todos/[todoId]/put.ts"),
  },
  {
    method: "DELETE",
    pathname: "/todos/:todoId",
    pattern: new URLPattern({ pathname: "/todos/:todoId" }),
    controller: import("./controllers/todos/[todoId]/delete.ts"),
  },
];
