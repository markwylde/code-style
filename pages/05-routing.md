---
title: "Routing with String Patterns"
tagline: "Declarative paths. Predictable handlers."
subtitle: "Building HTTP entrypoints without frameworks"
date: "2025-09-27"
category: "Architecture"
tags: ["routing", "string-patterns", "http", "controllers"]
order: 5
---

:::tip
**Routing Principle**

Declare every route explicitly. Pair it with a controller file that performs only HTTP concerns. Let models and services own the rest.
:::

## Why String Patterns

String patterns with `:param` syntax provide a simple, readable way to define routes. They're matched using a custom `matchRoute` utility that extracts parameters without external dependencies.

- **Explicit**: Each route describes its method and pattern in one object.
- **Typed parameters**: Parameters are extracted and validated through Zod schemas.
- **Simple**: No complex regex or external pattern matching libraries.
- **Framework-free**: Keeps the codebase dependency-light, per the spec.

```typescript
const routes: Route[] = [
  {
    method: "GET",
    pattern: "/users",
    controller: import("./controllers/users/get")
  },
  {
    method: "POST",
    pattern: "/users",
    controller: import("./controllers/users/post")
  },
  {
    method: "GET",
    pattern: "/users/:userId",
    controller: import("./controllers/users/[userId]/get")
  }
];
```

## Route Tables, Not Switch Statements

The HTTP server builds once and receives the immutable `routes` table. On every request, it searches for the first match.

```typescript
export function createServer(context: Context) {
  return http.createServer(async (request, response) => {
    const { pathname } = parse(request.url || "", true);

    for (const route of routes) {
      if (request.method !== route.method) continue;

      const matchedParams = pathname ? matchRoute(pathname, route.pattern) : null;
      if (!matchedParams) continue;

      let controller: ControllerModule;
      try {
        controller = await route.controller;
      } catch {
        response.writeHead(500, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "Failed to load controller module" }));
        return;
      }

      try {
        const paramsSchema = (controller.schema as z.ZodObject<any>).shape?.params;
        const params = paramsSchema ? paramsSchema.parse(matchedParams) : {};

        await controller.handler({
          context,
          request,
          response,
          params,
          body: undefined,
        });
        return;
      } catch (error) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : "Bad Request",
          })
        );
        return;
      }
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Not Found" }));
  });
}
```

This design keeps server lifecycle portable: the same `createServer` is used in tests and production, matching the spec's lifecycle rules.

## Filesystem Mirrors the Router

Route patterns mirror controller files:

```text
controllers/
├── users/
│   ├── get.ts          → GET /users
│   ├── post.ts         → POST /users
│   └── [id]/
│       ├── get.ts      → GET /users/:id
│       └── post.ts     → POST /users/:id
└── posts/
    └── get.ts          → GET /posts
```

- Folder names represent static segments.
- Bracketed folders `[id]` represent dynamic parameters.
- File names map to HTTP verbs in lowercase.

When a new controller file appears, add the corresponding entry to the routes table. Tests can assert the route exists by hitting the HTTP server rather than calling controller functions directly.

## Working with Parameters

String patterns use `:param` syntax for dynamic segments. The `matchRoute` utility extracts parameters, and controllers validate them through Zod schemas.

```typescript
// controllers/users/[userId]/get.ts
import { z } from 'zod';
import type { Handler } from '../../../createServer';
import { findUserById } from '../../../models/users';

export const schema = z.object({
  params: z.object({
    userId: z.string().uuid(),
  }),
});

export async function handler({ context, params, response }: Handler<typeof schema>) {
  const user = await findUserById(context, params.userId);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  response.setHeader('Content-Type', 'application/json');
  response.writeHead(200);
  response.end(JSON.stringify(user));
}
```

- Convert path parameters to domain types inside controllers (numbers, UUID validation, etc.).
- Query strings are read via `url.searchParams`—never by parsing `request.url` manually.
- Controllers may throw domain errors; top-level error middleware handles translation into HTTP responses.

## Dynamic Imports for Controllers

Routes use dynamic imports to load controllers on-demand. Each controller exports a `schema` for validation and a `handler` function.

```typescript
// createServer.ts
const routes: Route[] = [
  {
    method: "GET",
    pattern: "/users",
    controller: import("./controllers/users/get"),
  },
  {
    method: "POST",
    pattern: "/users",
    controller: import("./controllers/users/post"),
  },
  {
    method: "GET",
    pattern: "/users/:userId",
    controller: import("./controllers/users/[userId]/get"),
  }
];
```

Controllers are loaded dynamically when routes are matched. Each controller exports a typed handler function that receives validated parameters and context.

## Testing Routes End-to-End

Tests should spin up the real HTTP server using `createServer` and make real HTTP requests. This verifies routing, controller wiring, and OpenAPI registration in one pass.

```typescript
it("GET /users/:id returns user", async () => {
  const server = await createTestServer();
  const response = await fetch(`${server.url}/users/${testUser.id}`);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.id, testUser.id);
});
```

- Avoid calling controller functions directly; that bypasses routing guarantees.
- Seed data through models or fixtures so routes test real business flow.

## Adding a New Route

1. Create the controller file in the correct folder structure (e.g., `controllers/users/[userId]/get.ts`).
2. Export a `schema` object with Zod validation for `params` and `body`.
3. Export a `handler` function that receives validated data.
4. Add the route to the routes array in `createServer.ts` with a string pattern.
5. Add end-to-end tests that hit the route via HTTP.

Following this checklist keeps routing predictable, controllers thin, and models isolated—exactly what the spec demands.
