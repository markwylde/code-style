---
title: "Error Contract"
tagline: "Let failures keep their shape until the boundary can translate them."
subtitle: "A disciplined contract for throwing, bubbling, and returning errors"
date: "2026-05-15"
category: "Operations"
tags: ["error-handling", "contracts", "nodejs", "operations"]
order: 8
---

Errors are part of the system contract.
They should explain what failed, preserve the original cause, and arrive at one boundary that knows how to turn them into an HTTP response.

The default rule is simple: throw meaningful errors where the meaning is known, then let them bubble.

:::info
**The Boundary Rule**

Models and services throw. Controllers validate, authorize, and call them. The top-level HTTP handler translates errors into responses. Most functions should not catch anything.
:::

## What The Contract Requires

Every application error should answer three questions:

- What happened?
- What status should the API return?
- What stable code can clients and tests assert on?

```typescript
export class AppError extends Error {
  statusCode: number;
  code: string;
  details: unknown;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    options: { cause?: unknown; details?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = options.details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown, cause?: unknown) {
    super(message, 400, "VALIDATION_ERROR", { details, cause });
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", cause?: unknown) {
    super(message, 404, "NOT_FOUND", { cause });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 409, "CONFLICT", { cause });
    this.name = "ConflictError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", cause?: unknown) {
    super(message, 403, "FORBIDDEN", { cause });
    this.name = "ForbiddenError";
  }
}
```

Use these errors for domain meaning, not as wrappers for every failure.
If PostgreSQL, zod, or the filesystem already provides useful failure details, preserve them unless you are deliberately translating the failure into application language.

## Where Errors Come From

Models throw domain and data errors:

```typescript
export async function findTodoById(context: Context, todoId: string) {
  const todo = await context.db.query.todos.findFirst({
    where: eq(todos.id, todoId),
  });

  if (!todo) {
    throw new NotFoundError("Todo not found");
  }

  return todo;
}
```

Controllers parse, authorize, and let failures bubble:

```typescript
export async function getTodoController(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  params: { todoId: string },
) {
  await requireSession(context, request);
  const todo = await findTodoById(context, params.todoId);
  sendJson(response, 200, todo);
}
```

The controller does not catch `NotFoundError`.
It does not log and rethrow.
It does not decide what a 404 response looks like.

## One Translation Boundary

The server wrapper owns final error translation:

```typescript
export function createServer(context: Context) {
  return createHttpServer(async (request, response) => {
    try {
      await routeRequest(context, request, response);
    } catch (error) {
      handleHttpError(context, response, error);
    }
  });
}

function handleHttpError(
  context: Context,
  response: ServerResponse,
  error: unknown,
) {
  if (error instanceof ZodError) {
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
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  context.logger.error({ error }, "Unhandled request error");
  sendJson(response, 500, {
    error: "Internal server error",
    code: "INTERNAL_SERVER_ERROR",
  });
}
```

This keeps response shape consistent and keeps logging out of individual model and controller functions.

## When To Catch

Catch only when the catch block changes the outcome in a useful way.

### Translate External Shape

```typescript
export async function readProjectFile(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new NotFoundError(`File not found: ${path}`, error);
    }

    throw error;
  }
}
```

### Preserve Cleanup

```typescript
export async function withTempFile<T>(
  callback: (path: string) => Promise<T>,
) {
  const path = join(tmpdir(), crypto.randomUUID());

  try {
    await writeFile(path, "");
    return await callback(path);
  } finally {
    await rm(path, { force: true });
  }
}
```

### Preserve Transaction Semantics

```typescript
export async function withTransaction<T>(
  context: Context,
  callback: (context: Context) => Promise<T>,
) {
  return context.db.transaction(async (tx) => {
    return callback({ ...context, db: tx });
  });
}
```

Let the database transaction helper roll back on thrown errors.
Do not catch inside the callback unless you can really recover.

## What To Avoid

:::warning
**Do Not Destroy The Signal**

An error that loses its cause, type, stack, or domain code is harder to debug and harder to test.
:::

Avoid these patterns:

- Catching only to log and rethrow.
- Replacing a specific error with `new Error("Something failed")`.
- Returning `null` when the real state is "the database failed."
- Continuing after a required side effect fails.
- Checking `error.message` strings instead of stable error classes or codes.

```typescript
// Bad: hides the real failure and lies to the caller.
try {
  await sendWelcomeEmail(context, user);
} catch {
  return user;
}

// Good: make optional work explicit at the call site.
if (shouldSendWelcomeEmail) {
  await sendWelcomeEmail(context, user);
}
```

## Operational Checklist

Before merging error-handling code, check:

- Does each model throw domain errors for domain failures?
- Does each controller let model and validation errors bubble?
- Does the server have one HTTP error translator?
- Are unexpected errors logged once, at the boundary?
- Are error responses stable enough for clients and tests?
- Are original causes preserved when translating external errors?

The goal is not to catch fewer errors for style points.
The goal is to keep failure honest until the one place that can safely translate it.
