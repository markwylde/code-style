---
title: "Practical Patterns"
tagline: "Small functions, explicit context, boring control flow."
subtitle: "Patterns that keep operations code clear without adding a framework"
date: "2026-05-15"
category: "Patterns"
tags: ["patterns", "utilities", "nodejs", "operations"]
order: 13
---

Patterns should make code easier to read at the call site.
They should not hide ownership, lifecycle, configuration, or errors.

The patterns below fit the style of this guide: plain functions, explicit context, native Node APIs, and focused helpers that can be tested against the real system.

:::info
**Pattern Rule**

Extract a pattern when it removes repeated operational risk. Keep one-off logic local until the repetition is real.
:::

## Request Body Pattern

Controllers own request-body parsing.
Routers should match routes and parse params/query; models should never know about HTTP.

```typescript
export async function readBody(
  request: IncomingMessage,
  maxBodyBytes: number,
) {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;

    if (size > maxBodyBytes) {
      throw new ValidationError("Request body too large");
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export async function getBodyFromRequest(
  context: Context,
  request: IncomingMessage,
) {
  const body = await readBody(request, context.config.maxBodyBytes);

  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    throw new ValidationError("Invalid JSON in request body", undefined, error);
  }
}
```

The limit comes from explicit config.
The parse failure becomes a domain-shaped validation error while preserving the cause.

## Response Pattern

Keep response helpers small and predictable.
They should write status, headers, and body; they should not decide business meaning.

```typescript
export function sendJson(
  response: ServerResponse,
  statusCode: number,
  data: unknown,
) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(data));
}
```

Use the central HTTP error handler for error response shape.
Do not scatter response error formatting through controllers.

## Route Table Pattern

Prefer a declarative route table over framework middleware chains.

```typescript
export type Route = {
  method: string;
  pattern: URLPattern;
  schema?: {
    params?: ZodType;
    query?: ZodType;
  };
  handler: Controller;
};

export const routes: Route[] = [
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/todos/:todoId" }),
    schema: { params: TodoParamsSchema },
    handler: getTodoController,
  },
];
```

The table makes HTTP surface area visible.
Health, readiness, OpenAPI, and feature endpoints should all be normal route entries, not special cases in `createServer`.

## Test Builder Pattern

Test builders should create valid inputs without replacing real persistence.

```typescript
export function buildCreateTodoInput(
  overrides: Partial<CreateTodoInput> = {},
): CreateTodoInput {
  return {
    title: `Todo ${crypto.randomUUID()}`,
    description: "A test todo",
    ...overrides,
  };
}
```

Use builders to reduce noise.
Use models and HTTP calls to actually write and read data.

```typescript
test("updates a todo title", async () => {
  const context = await createTestContext();
  const todo = await createTodo(context, buildCreateTodoInput());

  const updated = await updateTodo(context, todo.id, { title: "Updated" });

  assert.equal(updated.title, "Updated");
});
```

## External Service Mock Pattern

Mocks are appropriate at third-party boundaries.
Shape them like the provider contract and keep assertions about visible behavior.

```typescript
export function createMockPaymentProvider() {
  const charges: Array<{ amount: number; token: string }> = [];

  return {
    charges,
    async createCharge(amount: number, token: string) {
      if (amount <= 0) {
        throw new Error("Amount must be positive");
      }

      charges.push({ amount, token });
      return { id: crypto.randomUUID(), status: "paid" };
    },
  };
}
```

Inject this through context in tests.
Do not use this pattern for your database, models, controllers, or router.

## Retry Pattern

Retries belong at unreliable external boundaries.
They should be explicit about what is retryable and should preserve the final error.

```typescript
export async function retry<T>(
  operation: () => Promise<T>,
  options: {
    attempts: number;
    delayMs: number;
    shouldRetry: (error: unknown) => boolean;
  },
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === options.attempts || !options.shouldRetry(error)) {
        throw error;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, options.delayMs * attempt);
      });
    }
  }

  throw lastError;
}
```

Do not retry validation failures, permission failures, or local programming errors.
Retry only failures that are expected to be transient.

## Background Work Pattern

Background work must respect context lifecycle.
Nothing spawned by a server may keep writing after that server is stopping or closed.

```typescript
export function startTodoDigestWorker(context: Context) {
  const timer = setInterval(async () => {
    if (context.lifecycle.isStopping()) {
      return;
    }

    await sendPendingDigests(context);
  }, 60_000);

  context.cleanup.register(() => {
    clearInterval(timer);
  });
}
```

If work must survive restart, persist it to a durable queue and resume it after startup.
Do not let stale context instances keep touching databases, queues, or files.

## Cache Pattern

Use a tiny in-memory cache only for contained, per-process cases.
For production behavior across instances, prefer a real backing service such as Redis and test it through Compose.

```typescript
export function createMemoryCache<T>(ttlMs: number) {
  const values = new Map<string, { value: T; expiresAt: number }>();

  return {
    get(key: string) {
      const item = values.get(key);

      if (!item || item.expiresAt <= Date.now()) {
        values.delete(key);
        return undefined;
      }

      return item.value;
    },
    set(key: string, value: T) {
      values.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    clear() {
      values.clear();
    },
  };
}
```

Do not promote a local helper into a shared package until more than one service actually needs it.

## Pattern Checklist

Before adding a helper, check:

- Does the name make the call site clearer?
- Does it preserve explicit context and configuration?
- Does it let errors bubble unless it is translating meaning?
- Does it avoid framework-specific request, response, or lifecycle types outside the edge?
- Does it stay small enough to understand without a second abstraction?
- Is the pattern backed by tests that exercise the real dependency where the project owns that dependency?

Useful patterns make operational behavior more obvious.
If a pattern makes ownership harder to see, keep the code inline.
