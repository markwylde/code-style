---
title: "Project Shape"
tagline: "Where code lives, and what each place is allowed to own"
subtitle: "A monorepo layout for runnable services and reusable packages"
date: "2025-04-03"
category: "Introduction"
tags: ["monorepo", "nodejs", "architecture", "docker"]
order: 2
---

The directory layout is part of the architecture. It should answer two questions quickly:

- Can this thing run by itself?
- Is this thing shared by more than one runnable app?

That is the split between `services/` and `packages/`.

## Target Layout

```text
project/
+-- services/
|   +-- api/
|   |   +-- src/
|   |   |   +-- main.ts
|   |   |   +-- createServer.ts
|   |   |   +-- createContext.ts
|   |   |   +-- config.ts
|   |   |   +-- types.ts
|   |   |   +-- errors.ts
|   |   |   +-- routes.ts
|   |   |   +-- schemas/
|   |   |   +-- controllers/
|   |   |   +-- models/
|   |   |   +-- services/
|   |   |   +-- utils/
|   |   +-- tests/
|   |   +-- package.json
|   |   +-- tsconfig.json
|   +-- ui/
|   |   +-- src/
|   |   +-- index.html
|   |   +-- package.json
|   |   +-- tsconfig.json
|   +-- admin-ui/
|       +-- src/
|       +-- index.html
|       +-- package.json
|       +-- tsconfig.json
+-- packages/
|   +-- design-system/
|   |   +-- src/
|   |   +-- package.json
|   |   +-- tsconfig.json
|   +-- discovery/
|       +-- src/
|       +-- package.json
|       +-- tsconfig.json
+-- Dockerfile
+-- docker-compose.yml
+-- package.json
+-- tsconfig.json
```

The sample in this repository is intentionally smaller, but it follows the same shape: one runnable API service with clear runtime, controller, model, schema, and test boundaries.

## Services

`services/` contains runnable applications. A service can be started, tested, deployed, exposed on a port, watched by Docker Compose, or owned by a team as a runtime unit.

Common examples:

- `services/api`: a Node HTTP API
- `services/ui`: a React app compiled to static assets
- `services/admin-ui`: a separate admin React app
- `services/worker`: a background process
- `services/scheduler`: a scheduled job process

Each service owns its own runtime decisions: config loading, server creation, process startup, service-specific tests, and Docker Compose watch rules.

## Packages

`packages/` contains reusable libraries. A package is imported by services but does not run by itself.

Common examples:

- `packages/design-system`: shared React components, CSS Modules, tokens, and icons
- `packages/discovery`: service discovery helpers or typed endpoint metadata
- `packages/feature-flags`: shared flag evaluation code
- `packages/sdk`: typed client code for another service

Packages must have explicit public exports. They should not load environment variables, open ports, create process signal handlers, start servers, or own Docker services. If code does those things, it belongs in `services/`.

## API Service Anatomy

Inside a Node API service, the important split is runtime edge, HTTP edge, and application core.

```text
services/api/src/
+-- main.ts              # process entrypoint
+-- config.ts            # environment parsing and config defaults
+-- createServer.ts      # HTTP server lifecycle
+-- createContext.ts     # dependency and resource assembly
+-- routes.ts            # method/path/controller declarations
+-- types.ts             # shared service-local types
+-- errors.ts            # application error classes
+-- controllers/         # HTTP adapters
+-- schemas/             # external input/output validation
+-- models/              # application rules and data access
+-- services/            # external provider integrations
+-- utils/               # small service-local helpers
```

The folders are not a ceremony. They prevent unrelated concerns from quietly mixing.

## Controllers And Routes

Routes declare the public HTTP surface:

```typescript
export const routes: Route[] = [
  {
    method: "GET",
    pathname: "/todos/:todoId",
    pattern: new URLPattern({ pathname: "/todos/:todoId" }),
    controller: import("./controllers/todos/[todoId]/get.ts"),
  },
];
```

Controller file paths should mirror route paths when it improves scanability:

```text
controllers/
+-- todos/
    +-- get.ts
    +-- post.ts
    +-- [todoId]/
        +-- get.ts
        +-- put.ts
        +-- delete.ts
```

Controllers translate HTTP into application calls. They can parse bodies, validate schemas, check authorization, and send responses. They should not own database queries or business rules.

## Models And Services

Models own rules and data access:

```typescript
export async function getTodoById(
  context: Context,
  todoId: string,
): Promise<Todo> {
  const todo = context.db.todos.getById(todoId);
  if (!todo) {
    throw new NotFoundError("Todo not found");
  }
  return todo;
}
```

Service-local `services/` modules own integrations and cross-boundary side effects such as email, payments, object storage, webhooks, and third-party APIs. They should be explicit functions that take `context` or providers from `context`.

## Schemas And Types

Use schemas for external shapes: request params, query strings, request bodies, responses, webhook payloads, and provider responses.

Use TypeScript types for internal contracts. Prefer `type` aliases over `interface`. Avoid `enum`, `namespace`, parameter properties, decorators, and other TypeScript features that require runtime code generation.

Node should be able to run the source directly. That means local imports need runtime-valid specifiers:

```typescript
import { createTodo } from "../../models/todos.ts";
```

Do not rely on `ts-node`, `tsx`, transpiled path aliases, or framework-specific transforms for normal runtime behavior.

## UI Services

UI and admin UI services use React, TypeScript, and CSS Modules. They compile to static assets served by the Node HTTP service or deployed as static files.

Do not introduce server-side rendering frameworks for this architecture. A UI service is still a service because it has a build, dev server, package boundary, and Docker Compose watch rules.

Shared UI belongs in `packages/design-system` only after there is a real shared need. The first implementation can stay local to the UI service.

## Docker Shape

Normal development should start from a fresh clone with:

```bash
docker compose up --build --watch
```

Every project-owned runtime belongs in `docker-compose.yml`: API, UI, admin UI, databases, queues, caches, mail test services, object stores, and workers.

Use Docker Compose Watch intentionally:

- `sync` for source files the running process can hot-reload or watch.
- `sync+restart` for config or source changes that need a process restart.
- `rebuild` for dependency or image-shaping files such as `package.json`, lockfiles, and Dockerfiles.
- `initial_sync: true` so containers begin from the host's current files.

Do not sync `node_modules`, build output, coverage output, `.git`, or OS artifacts into containers. Dependencies should be installed inside the image so native packages match the container OS and architecture.

## Placement Checks

:::tip
**A Quick Test**

If code starts a process, it belongs in a service. If code is imported by more than one service and has no runtime side effects, it may belong in a package. If code needs config, clients, pools, providers, or cleanup, put those dependencies in context and pass context to the functions that use them.
:::

Good project shape is not about having many folders. It is about making ownership obvious before the codebase grows.
