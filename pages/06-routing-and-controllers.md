---
title: "Routing And Controllers"
tagline: "Declare the path. Validate the edge. Hand off the work."
subtitle: "HTTP Without Framework Magic"
date: "2025-09-27"
category: "Build The Core"
tags: ["routing", "controllers", "urlpattern", "http", "openapi"]
order: 6
---

:::tip
Routes and controllers are the HTTP edge. They match requests, validate transport input, enforce auth, call models or services, and shape responses. They do not query tables.
:::

The router is a small utility around three ideas:

- Every endpoint is declared in a route table.
- Every route uses `URLPattern`.
- Every matched route loads a controller file.

That includes `/health`, `/ready`, `/openapi`, and any other infrastructure endpoint. If it responds to HTTP, it belongs in the route table.

## Route Table

Use an explicit list instead of framework registration or switch statements.

```typescript
import type { Route } from "./utils/createRouter.ts";

export const routes: Route[] = [
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/health" }),
    controller: import("./controllers/health/get.ts"),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/users" }),
    controller: import("./controllers/users/get.ts"),
  },
  {
    method: "POST",
    pattern: new URLPattern({ pathname: "/users" }),
    controller: import("./controllers/users/post.ts"),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/users/:userId" }),
    controller: import("./controllers/users/[userId]/get.ts"),
  },
];
```

Local TypeScript imports include the full `.ts` filename because source runs directly on Node's native TypeScript support. Do not rely on transpiled path aliases or framework-specific transforms.

## Files Mirror URLs

Controller files mirror the route structure:

```text
controllers/
├── health/
│   └── get.ts             -> GET /health
├── users/
│   ├── get.ts             -> GET /users
│   ├── post.ts            -> POST /users
│   └── [userId]/
│       ├── get.ts         -> GET /users/:userId
│       └── put.ts         -> PUT /users/:userId
└── posts/
    ├── get.ts             -> GET /posts
    └── [postId]/
        └── get.ts         -> GET /posts/:postId
```

- Folder names represent static path segments.
- Bracketed folders represent dynamic path parameters.
- File names are lowercase HTTP methods.
- Adding a controller file is not enough; add the matching route table entry.

This convention keeps navigation obvious without asking the filesystem to become a router.

## Router Responsibilities

The router should stay mechanical:

1. Parse the URL using the configured public base URL.
2. Match method and `URLPattern`.
3. Validate route params and query strings.
4. Call the controller with validated transport data.
5. Convert thrown errors into HTTP responses in one place.

```typescript
export function createRouter(context: Context, routes: Route[]) {
  return async function handleRequest(
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ) {
    try {
      if (!request.url || !request.method) {
        throw new BadRequestError("Invalid request");
      }

      const url = new URL(request.url, context.config.publicBaseUrl);

      for (const route of routes) {
        if (route.method !== request.method) continue;

        const match = route.pattern.exec({ pathname: url.pathname });
        if (!match) continue;

        const controller = await route.controller;
        const params = parseSchema(
          controller.schema.params,
          match.pathname.groups,
        );
        const query = parseSchema(
          controller.schema.query,
          Object.fromEntries(url.searchParams.entries()),
        );

        await controller.handler({
          context,
          request,
          response,
          params,
          query,
        });
        return;
      }

      throw new NotFoundError("Route not found");
    } catch (error) {
      handleHttpError(error, response);
    }
  };
}
```

Routers parse params and query only. Request bodies are controller-owned because body limits, content types, streaming behavior, and endpoint semantics vary by route.

## Controller Shape

Controllers are thin HTTP adapters. They declare the external contract, parse endpoint-specific input, enforce authentication and authorization, call models or services, and write the HTTP response.

```typescript
// controllers/users/[userId]/get.ts
import { z } from "zod";
import { requireSession } from "../../../services/auth.ts";
import { findUserById } from "../../../models/users.ts";
import { UserResponseSchema } from "../../../schemas/users.ts";
import { sendJsonValidated } from "../../../utils/http.ts";
import type { Handler } from "../../../utils/createRouter.ts";

export const schema = {
  params: z.object({
    userId: z.string().uuid(),
  }),
  response: UserResponseSchema,
};

export async function handler({
  context,
  request,
  response,
  params,
}: Handler<typeof schema>) {
  const session = await requireSession(context, request);

  if (session.userId !== params.userId && !session.isAdmin) {
    throw new ForbiddenError("Cannot read this user");
  }

  const user = await findUserById(context, params.userId);

  sendJsonValidated(response, 200, user, schema.response);
}
```

The controller knows about HTTP, sessions, status codes, and response schemas. The model knows how to retrieve the user.

## Body Parsing Belongs In Controllers

The route table should not guess how to read a body. Controllers choose the mode and validate the result.

```typescript
// controllers/users/post.ts
import { z } from "zod";
import { createUser } from "../../models/users.ts";
import { sendWelcomeEmail } from "../../services/email.ts";
import {
  CreateUserRequestSchema,
  UserResponseSchema,
} from "../../schemas/users.ts";
import { getBodyFromRequest, sendJsonValidated } from "../../utils/http.ts";
import type { Handler } from "../../utils/createRouter.ts";

export const schema = {
  body: CreateUserRequestSchema,
  response: UserResponseSchema,
};

export async function handler({
  context,
  request,
  response,
}: Handler<typeof schema>) {
  const body = schema.body.parse(
    await getBodyFromRequest(context, request, "json", {
      maxBytes: context.config.maxBodyBytes,
    }),
  );

  const user = await createUser(context, body);
  await sendWelcomeEmail(context, user);

  sendJsonValidated(response, 201, user, schema.response);
}
```

This keeps endpoint-specific input rules close to the endpoint. A file upload, a JSON request, and an empty `DELETE` body do not need the same parser path.

## Query And Params

`URLPattern` returns path groups as strings. Query strings also arrive as strings. Validate and convert them before the controller uses them.

```typescript
export const schema = {
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    search: z.string().trim().min(1).optional(),
  }),
};

export async function handler({
  context,
  response,
  query,
}: Handler<typeof schema>) {
  const result = await listUsers(context, query);
  sendJsonValidated(response, 200, result, UsersListResponseSchema);
}
```

The router does the parsing. The model receives typed options and owns pagination behavior, filtering behavior, and database queries.

## Authentication And Authorization

Authentication and authorization live at the HTTP edge because they answer transport questions:

- Who is making this request?
- Is this caller allowed to use this endpoint?
- Is this caller allowed to access this specific resource?

```typescript
export async function handler({
  context,
  request,
  response,
  params,
}: Handler<typeof schema>) {
  const session = await requireSession(context, request);

  if (!session.isAdmin && session.userId !== params.userId) {
    throw new ForbiddenError("Cannot update another user");
  }

  const body = schema.body.parse(
    await getBodyFromRequest(context, request, "json", {
      maxBytes: context.config.maxBodyBytes,
    }),
  );

  const user = await updateUser(context, params.userId, body);

  sendJsonValidated(response, 200, user, schema.response);
}
```

Models assume the caller is authorized. If a permission check is shared, extract an explicit auth helper used by controllers.

## OpenAPI Lives At The Edge

External API schemas describe the HTTP contract. Controllers should export enough schema metadata for OpenAPI generation without making models depend on OpenAPI.

```typescript
export const schema = {
  params: z.object({
    userId: z.string().uuid(),
  }),
  response: UserResponseSchema,
  openapi: {
    summary: "Get a user",
    tags: ["Users"],
  },
};
```

The OpenAPI route itself is still a normal route:

```typescript
{
  method: "GET",
  pattern: new URLPattern({ pathname: "/openapi.json" }),
  controller: import("./controllers/openapi/get.ts"),
}
```

No endpoint is special enough to bypass routing.

## Error Flow

Controllers should usually let errors bubble. Models throw domain errors such as `NotFoundError`, `ConflictError`, and `ValidationError`. The router's top-level error handler translates them into HTTP responses.

```typescript
function handleHttpError(error: unknown, response: http.ServerResponse) {
  if (error instanceof z.ZodError) {
    sendJson(response, 400, {
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: error.issues,
    });
    return;
  }

  if (error instanceof AppError) {
    sendJson(response, error.statusCode, {
      error: error.message,
      code: error.code,
    });
    return;
  }

  console.error("Unhandled request error", error);
  sendJson(response, 500, {
    error: "Internal server error",
    code: "INTERNAL_SERVER_ERROR",
  });
}
```

One translation layer is easier to test and easier to trust than scattered `try/catch` blocks.

## Testing Routes

Test routes through the real HTTP server. Calling controllers directly skips the behavior the route is supposed to guarantee.

```typescript
test("GET /users/:userId returns the user", async () => {
  const server = await createTestServer();

  try {
    const user = await createUser(server.context, {
      email: "ada@example.com",
      password: "correct horse battery staple",
    });

    const response = await fetch(new URL(`/users/${user.id}`, server.url));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      id: user.id,
      email: user.email,
    });
  } finally {
    await server.stop();
  }
});
```

This verifies route matching, params/query validation, auth behavior, controller wiring, error translation, and response shape.

## Controller Checklist

- Export a `schema` object for params, query, body, response, and OpenAPI metadata as needed.
- Parse body inside the controller, not in the router.
- Enforce auth in the controller or a helper called by the controller.
- Call models for data and domain behavior.
- Call services for external protocols or cross-boundary workflows.
- Do not use `context.db` in controllers.
- Let errors bubble to the top-level HTTP error handler.
- Add end-to-end tests that hit the route over HTTP.

Routing and controllers are the first boundary of the core. Keep the boundary thin and explicit, and the rest of the system stays easier to reason about.
