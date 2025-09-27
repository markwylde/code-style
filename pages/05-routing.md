---
title: "Routing with URLPattern"
tagline: "Declarative paths. Predictable handlers."
subtitle: "Building HTTP entrypoints without frameworks"
date: "2025-09-27"
category: "Architecture"
tags: ["routing", "urlpattern", "http", "controllers"]
order: 5
---

:::tip
**Routing Principle**

Declare every route explicitly. Pair it with a controller file that performs only HTTP concerns. Let models and services own the rest.
:::

## Why URLPattern

`URLPattern` is part of the Web Platform. It matches paths declaratively without custom regex helpers or framework routers.

- **Explicit**: Each route describes its method and pattern in one object.
- **Typed parameters**: Matches return named groups you can pass to controllers.
- **Portable**: Works the same in Node and browser runtimes, making tests deterministic.
- **Framework-free**: Keeps the codebase dependency-light, per the spec.

```typescript
export const routes = [
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/users" }),
    handler: usersController.get
  },
  {
    method: "POST",
    pattern: new URLPattern({ pathname: "/users" }),
    handler: usersController.post
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/users/:id" }),
    handler: usersIdController.get
  }
];
```

## Route Tables, Not Switch Statements

The HTTP server builds once and receives the immutable `routes` table. On every request, it searches for the first match.

```typescript
export async function createServer(context) {
  const routes = createRoutes(context);

  const server = http.createServer(async (request, response) => {
    const match = matchRoute(routes, request);
    if (!match) return sendNotFound(response);

    await match.handler({
      context,
      request,
      response,
      params: match.params
    });
  });

  return { start: () => startServer(server, context), stop: () => stopServer(server) };
}

function matchRoute(routes, request) {
  const method = request.method?.toUpperCase();
  const url = new URL(request.url ?? "", `http://${request.headers.host}`);

  for (const route of routes) {
    if (route.method !== method) continue;
    const result = route.pattern.exec(url);
    if (!result) continue;
    return {
      handler: route.handler,
      params: result.pathname?.groups ?? {}
    };
  }

  return null;
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

`URLPattern` extracts named groups from the pathname. Controllers receive parameters already parsed; they do not repeat matching logic.

```typescript
// routes/users.ts
const usersIdPattern = new URLPattern({ pathname: "/users/:id" });

export const usersRoutes = [
  {
    method: "GET",
    pattern: usersIdPattern,
    handler: async ({ context, request, response, params }) => {
      const { id } = params;
      const user = await getUser(context, { id });
      sendJsonValidated(response, 200, user, UserSchema);
    }
  }
];
```

- Convert path parameters to domain types inside controllers (numbers, UUID validation, etc.).
- Query strings are read via `url.searchParams`—never by parsing `request.url` manually.
- Controllers may throw domain errors; top-level error middleware handles translation into HTTP responses.

## Nested Routers for Clarity

Keep route definition modules small and composable. Each domain exports an array of route objects. The root router merges them.

```typescript
// routes/index.ts
import { usersRoutes } from "./users";
import { postsRoutes } from "./posts";

export function createRoutes(context) {
  return [
    ...usersRoutes.map(route => ({ ...route, handler: route.handler.bind(null, context) })),
    ...postsRoutes.map(route => ({ ...route, handler: route.handler.bind(null, context) }))
  ];
}
```

Route creation happens once per server lifecycle, satisfying the spec's requirement to reuse the same factory for tests and production. Controllers remain stateless functions operating on the provided context.

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

1. Create the controller file in the correct folder structure.
2. Define or reuse a `URLPattern` for the path.
3. Register the controller in the route table with the correct HTTP method.
4. Add end-to-end tests that hit the route via HTTP.
5. Ensure OpenAPI registration lives inside the controller.

Following this checklist keeps routing predictable, controllers thin, and models isolated—exactly what the spec demands.
