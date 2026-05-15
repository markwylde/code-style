---
title: "Architecture At A Glance"
tagline: "The whole system in one mental model"
subtitle: "Services run. Packages share. Context connects."
date: "2025-04-03"
category: "Introduction"
tags: ["functional", "nodejs", "architecture", "monorepo"]
order: 1
---

This guide is about one architectural move: build Node.js systems from explicit functions instead of framework magic.

The project still has all the familiar production pieces: HTTP servers, routes, controllers, models, schemas, config, tests, Docker, React UIs, shared packages, and external services. The difference is that each piece has a narrow job, and dependencies travel through one plain object: `context`.

## The Map

Think of the application as a set of concentric boundaries:

```text
process
  main.ts
    load config
    create server
    start and stop the app

service runtime
  createServer.ts
    create context
    create Node HTTP server
    attach routes
    own lifecycle

request boundary
  routes.ts
  controllers/
    match method and path
    parse HTTP input
    validate external shapes
    call application functions
    write HTTP output

application core
  models/
  services/
    enforce rules
    read and write data
    call external providers through context

shared resources
  createContext.ts
    config
    database clients
    provider clients
    lifecycle state
    cleanup
```

Nothing outside the boundary should know more than it needs. `main.ts` does not know how a todo is created. A model does not know what an HTTP header is. A controller does not create database pools. Context holds resources so functions can stay honest about what they use.

## The Three Rules

### 1. Services Own Runtime

A top-level `services/` directory contains runnable things: API servers, web apps, workers, admin apps, and any process that can be started, deployed, exposed on a port, or managed by Docker Compose.

If it has a `main.ts`, listens on a port, loads environment config, serves static files, runs a queue worker, or belongs in `docker-compose.yml`, it is a service.

### 2. Packages Own Reuse

A top-level `packages/` directory contains reusable ES module libraries imported by services: design systems, service discovery helpers, typed clients, feature flag libraries, SDKs, and other shared code.

Packages do not own ports, Docker services, environment loading, or service-specific side effects. They expose useful modules; services decide when and how to run.

### 3. Context Owns Dependencies

Application functions receive `context` rather than importing singletons:

```typescript
export async function createTodo(
  context: Context,
  input: CreateTodoInput,
): Promise<Todo> {
  const existing = context.db.todos
    .getAll()
    .find((todo) => todo.title.toLowerCase() === input.title.toLowerCase());

  if (existing) {
    throw new ConflictError("Todo title must be unique");
  }

  const todo = {
    id: randomUUID(),
    title: input.title,
    completed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  context.db.todos.insert(todo);
  return todo;
}
```

This keeps dependencies visible. It also makes tests simpler: create a test context, call the real function, and mock only external systems the project does not own.

## Layer Responsibilities

| Layer | Owns | Does Not Own |
| --- | --- | --- |
| `main.ts` | process startup, signal handlers, fatal error logging | request handling or business rules |
| `createServer.ts` | Node HTTP server, routes, lifecycle, readiness | model logic or environment parsing details |
| `createContext.ts` | resources, config, providers, cleanup | HTTP parsing or route matching |
| `routes.ts` | method/path declarations and controller modules | controller behavior |
| `controllers/` | HTTP input/output, auth checks, schema parsing | database details or reusable business rules |
| `models/` | domain rules, queries, data transformations | HTTP request/response objects |
| `services/` inside a service | external effects such as email, payments, storage | hidden globals |
| `packages/` | reusable libraries with explicit exports | service runtime side effects |

The table is the mental guardrail. When a file starts doing work from another row, the architecture is drifting.

## The Request Story

A request should be easy to narrate:

1. Node receives an HTTP request.
2. The router finds one explicit route.
3. The controller reads request data and validates external shapes.
4. The controller calls a model or service with `context`.
5. The model enforces application rules and uses resources from `context`.
6. The controller serializes the response.
7. Unexpected errors bubble to one HTTP error boundary.

There is no hidden middleware chain mutating the request. There is no decorator system registering behavior elsewhere. There is no dependency injection container to inspect. The flow is just files and function calls.

## What To Optimize For

:::tip
**The North Star**

Optimize for code a new teammate can trace in one sitting. The architecture should make the common path obvious and the unusual path explicit.
:::

- Prefer built-in Node functionality before adding dependencies.
- Use TypeScript types for internal contracts and schemas for external input/output.
- Use `type` aliases instead of `interface`.
- Run source on Node's native TypeScript support; avoid features that require code generation.
- Keep local imports runtime-valid, including full `.ts` filenames.
- Keep comments rare and focused on why a surprising choice exists.
- Abstract only after the pattern is stable or the extraction clearly lowers cognitive load.
- Use Docker Compose as the normal development runtime so a fresh clone starts with one command.

## What Comes Next

`Project Shape` explains where files go and why.

`Runtime Flow` follows the app from process startup through request handling, error handling, and shutdown.
