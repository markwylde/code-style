---
title: "Runtime Flow"
tagline: "From process startup to graceful shutdown"
subtitle: "How requests move through the system"
date: "2025-04-03"
category: "Introduction"
tags: ["runtime", "nodejs", "architecture", "context"]
order: 3
---

Runtime flow is the architecture under motion. The files are small because each file owns one phase of the application lifecycle.

```text
main.ts
  load config
  create server
  start
  bind shutdown signals

createServer.ts
  create context
  create HTTP server
  route each request
  expose start/stop/restart

createContext.ts
  create resources
  expose dependencies
  destroy resources

routes.ts
  declare method + path + controller module

controllers/
  parse HTTP input
  validate schemas
  call models/services
  send HTTP output

models/
  enforce rules
  use context resources
  return typed results
```

## Boot Flow

The process entrypoint should be boring. It loads config, creates the app, starts it, and registers shutdown handlers.

```typescript
import { loadConfig } from "./config.ts";
import createServer from "./createServer.ts";

async function main() {
  const config = loadConfig(process.env);
  const app = createServer(config);

  await app.start();
  console.log(`Todo API listening on ${config.publicBaseUrl}`);

  const shutdown = async () => {
    await app.stop();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exit(1);
});
```

`main.ts` should not construct route tables, parse request bodies, or create database clients. It owns the process, not the application.

## Server Flow

The server factory binds the runtime pieces together:

```typescript
export function createServer(config: Config): AppServer {
  const context = createContext(config);
  const apiServer = http.createServer((request, response) => {
    createRouter(context, routes, request, response);
  });

  const app: AppServer = {
    context,
    servers: { api: apiServer },
    start: async () => {
      context.lifecycle.alive = true;
      await listen(apiServer, config.todoApiPort);
      await waitForHealth(config);
    },
    stop: async () => {
      context.lifecycle.alive = false;
      await close(apiServer);
      await context.destroy();
    },
    restart: async () => {
      await app.stop();
      await app.start();
    },
  };

  return app;
}
```

The exact helpers can vary, but the responsibilities should not. `createServer` owns HTTP server lifecycle and readiness. It should not own business rules.

## Context Flow

Context is created once per app instance and passed into request handling. It is where long-lived dependencies live.

```typescript
export function createContext(config: Config): Context {
  const todos = new Map<string, TodoRecord>();

  return {
    config,
    lifecycle: {
      alive: true,
    },
    db: {
      todos: {
        getAll: () => [...todos.values()],
        getById: (id: string) => todos.get(id),
        insert: (todo: TodoRecord) => {
          todos.set(todo.id, todo);
        },
        replace: (todo: TodoRecord) => {
          todos.set(todo.id, todo);
        },
        deleteById: (id: string) => {
          todos.delete(id);
        },
      },
    },
    destroy: async () => {
      todos.clear();
    },
  };
}
```

In a production service, this is where database pools, mail providers, object storage clients, queues, metrics clients, and other owned resources are assembled. Every resource created here must also have a cleanup path.

## Route Flow

Routes are data, not hidden registration side effects.

```typescript
export const routes: Route[] = [
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
];
```

This keeps the public HTTP surface readable. Infrastructure endpoints such as `/health`, `/ready`, and `/openapi.json` belong here too; they are routes, not special cases inside `createServer`.

## Request Flow

A controller adapts HTTP to the application core:

```typescript
const controller: ControllerModule = {
  schema: {
    response: TodoListResponseSchema,
  },
  openapi: {
    summary: "List todos",
    responses: {
      "200": {
        description: "Todos list",
      },
    },
  },
  handler: async ({ context, response }) => {
    const todos = await listTodos(context);
    sendJson(response, 200, TodoListResponseSchema.parse({ todos }));
  },
};

export default controller;
```

Controller work is deliberately thin:

- Read HTTP input.
- Validate params, query, body, and response shapes.
- Enforce request-level concerns such as auth.
- Call models or services with `context`.
- Write an HTTP response.

If a controller starts owning data rules or database details, move that logic inward.

## Model Flow

Models are where application rules live:

```typescript
export async function listTodos(context: Context): Promise<Todo[]> {
  assertContextAlive(context);
  return context.db.todos.getAll();
}

export async function getTodoById(
  context: Context,
  todoId: string,
): Promise<Todo> {
  assertContextAlive(context);

  const todo = context.db.todos.getById(todoId);
  if (!todo) {
    throw new NotFoundError("Todo not found");
  }

  return todo;
}
```

Models do not receive `request` or `response`. They do not know whether they are being called from HTTP, tests, a queue worker, or a script. That portability is the point.

## Error Flow

Errors should bubble until a boundary can add useful context or translate them into the protocol being served.

```text
model throws NotFoundError
  controller does not catch it unless it can recover
  router/server error boundary maps it to HTTP 404
  unexpected errors become HTTP 500
```

Avoid try/catch blocks that only log and rethrow, wrap errors generically, or return partial failure objects. Catch errors where you can either recover or translate them.

## Shutdown Flow

Stopping is part of correctness:

1. Mark lifecycle state as not alive.
2. Stop accepting new requests.
3. Destroy active sockets if needed.
4. Close the HTTP server.
5. Destroy context resources.

Tests should use the same lifecycle as production. Start the app, exercise the real system, then stop it. That is how leaks, stale sockets, and missing cleanup paths become visible before deployment.

## The Mental Shortcut

:::info
**Trace The Verb**

When you are unsure where code belongs, follow the verb. Start, stop, listen, and restart belong to the server. Parse, validate, and respond belong to controllers. Create, update, enforce, and query belong to models. Connect and destroy belong to context.
:::

Runtime flow is simple when each verb has one natural home.
