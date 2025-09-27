---
title: "Routing"
tagline: "String patterns. Typed paths. Zero magic."
subtitle: "Building HTTP entrypoints with plain Node APIs"
date: "2025-09-27"
category: "Architecture"
tags: ["routing", "zod", "http", "controllers"]
order: 5
---

# Routing

HTTP routing using explicit string patterns paired with Zod schemas for validation and type safety. No frameworks, no middleware magic—just clean, predictable request handling.

## Core Architecture

### Handler Type System

```typescript
import { z } from "zod";
import type { Handler } from "../../../createServer";

export const schema = z.object({
  params: z.object({
    userId: z.string().uuid(),
  }),
  body: z.object({
    firstName: z.string(),
    lastName: z.string(),
  }),
});

export async function handler({ params, request, response }: Handler<typeof schema>) {
  // params.userId is fully typed as string
  // body validation happens automatically
  const user = { id: params.userId };

  response.setHeader("Content-Type", "application/json");
  response.writeHead(200);
  response.end(JSON.stringify(user));
}
```

The `Handler<TSchema>` type extracts parameter and body types from your Zod schema, providing full type safety throughout your controllers.

## Route Registration

Routes are defined as dynamic imports with explicit patterns:

```typescript
const routes: Route[] = [
  {
    method: "GET",
    pattern: "/users",
    controller: import("./controllers/users/get"),
  },
  {
    method: "GET",
    pattern: "/users/:userId",
    controller: import("./controllers/users/[userId]/get"),
  },
  {
    method: "PUT",
    pattern: "/users/:userId",
    controller: import("./controllers/users/[userId]/put"),
  },
];
```

### File-Based Organization

Controllers follow a predictable file structure that mirrors URL paths:

```
controllers/
├── users/
│   ├── get.ts              # GET /users
│   ├── post.ts             # POST /users
│   └── [userId]/
│       ├── get.ts          # GET /users/:userId
│       └── put.ts          # PUT /users/:userId
└── posts/
    ├── get.ts              # GET /posts
    ├── post.ts             # POST /posts
    └── [postId]/
        ├── get.ts          # GET /posts/:postId
        └── put.ts          # PUT /posts/:postId
```

## Parameter Validation

Path parameters are automatically validated against your schema:

```typescript
// controllers/users/[userId]/get.ts
export const schema = z.object({
  params: z.object({
    userId: z.string().uuid(),
  }),
});

export async function handler({ context, params, response }: Handler<typeof schema>) {
  // params.userId is guaranteed to be a valid UUID string
  const user = await findUserById(context, params.userId);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  response.setHeader('Content-Type', 'application/json');
  response.writeHead(200);
  response.end(JSON.stringify(user));
}
```

Invalid parameters automatically return a 400 error before your handler runs.

## Request Body Handling

Body validation is handled through the schema and a utility function:

```typescript
// controllers/users/[userId]/put.ts
import { getBodyFromRequest } from "../../../utils/http";

export const schema = z.object({
  params: z.object({
    userId: z.string().uuid(),
  }),
  body: z.object({
    firstName: z.string(),
    lastName: z.string(),
  }),
});

export async function handler({ context, params, request, response }: Handler<typeof schema>) {
  const body = await getBodyFromRequest(request, schema);

  const updatedUser = {
    id: params.userId,
    firstName: body.firstName,
    lastName: body.lastName,
  };

  response.setHeader('Content-Type', 'application/json');
  response.writeHead(200);
  response.end(JSON.stringify(updatedUser));
}
```

## Route Matching

The `matchRoute` utility handles URL parameter extraction:

```typescript
export function matchRoute(pathname: string, routePattern: string): Record<string, string> | null {
  const pathSegments = pathname.split('/').filter(Boolean);
  const patternSegments = routePattern.split('/').filter(Boolean);

  if (pathSegments.length !== patternSegments.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index];
    const pathSegment = pathSegments[index];

    if (patternSegment.startsWith(':')) {
      params[patternSegment.slice(1)] = pathSegment;
      continue;
    }

    if (patternSegment !== pathSegment) {
      return null;
    }
  }

  return params;
}
```

## Server Implementation

The server loops through routes, matches patterns, validates parameters, and dispatches to handlers:

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

## Practical Examples

### Simple List Endpoint

```typescript
// controllers/users/get.ts
import { z } from "zod";
import type { Handler } from "../../createServer";
import { listUsers } from "../../models/users";

export const schema = z.object({
  params: z.object({}),
});

export async function handler({ context, response }: Handler<typeof schema>) {
  const users = await listUsers(context, { limit: 50, offset: 0 });

  response.setHeader('Content-Type', 'application/json');
  response.writeHead(200);
  response.end(JSON.stringify(users));
}
```

### Resource Creation

```typescript
// controllers/users/post.ts
import { z } from "zod";
import type { Handler } from "../../createServer";
import { getBodyFromRequest } from "../../utils/http";
import { createUser } from "../../models/users";
import { CreateUserSchema } from "../../schemas/users";

export const schema = z.object({
  params: z.object({}),
  body: CreateUserSchema,
});

export async function handler({ context, request, response }: Handler<typeof schema>) {
  const body = await getBodyFromRequest(request, schema);

  const user = await createUser(context, body);

  response.setHeader('Content-Type', 'application/json');
  response.writeHead(201);
  response.end(JSON.stringify(user));
}
```

## Key Benefits

**Type Safety**: Full TypeScript inference from Zod schemas to handler parameters

**No Magic**: Explicit imports and clear request handling flow

**Validation**: Automatic parameter and body validation with detailed error responses

**Testing**: Easy to test individual handlers with mocked contexts

**Performance**: Dynamic imports mean only loaded routes consume memory

**Debugging**: Clear stack traces with no middleware layers to navigate

This routing approach provides the power of frameworks while maintaining the simplicity and explicitness that makes Node.js applications maintainable.