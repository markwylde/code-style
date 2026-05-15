---
title: "Testing The Real System"
tagline: "Mock what you do not own. Exercise what you do."
subtitle: "A testing discipline for Node services built around context and Docker"
date: "2026-05-15"
category: "Operations"
tags: ["testing", "integration-tests", "docker", "nodejs"]
order: 9
---

Tests should prove that the system works, not that a set of mocks can agree with each other.
For this guide, the system includes your code, your database, your queues, your cache, your filesystem, and your HTTP server lifecycle.

Mock only the things outside your ownership boundary.

:::success
**Ownership Rule**

Use real versions of dependencies the project owns. Mock third-party systems such as payment providers, email APIs, SMS gateways, and external partner APIs.
:::

## What To Test For Real

Use real dependencies for:

- PostgreSQL and migrations
- Redis or other project-owned stores
- Queues and caches that are part of the app runtime
- The HTTP server factory and route table
- Controllers, models, zod schemas, and OpenAPI response shapes
- Startup, readiness, stop, and restart behavior

Mock dependencies outside the project boundary:

- Stripe, Twilio, SendGrid, and similar providers
- Partner HTTP APIs
- Unreliable network calls that would make local and CI runs depend on someone else's uptime

The context pattern keeps this clean because external services are explicit fields on `context.services`.

```typescript
export function createMockEmailProvider() {
  const sent: Array<{ to: string; subject: string; html: string }> = [];

  return {
    sent,
    async send(message: { to: string; subject: string; html: string }) {
      if (!message.to.includes("@")) {
        throw new Error("Invalid email address");
      }

      sent.push(message);
      return { messageId: crypto.randomUUID() };
    },
  };
}
```

This mock represents an external boundary.
It does not replace your model, controller, router, or database.

## Test Through Public Behavior

Avoid tests that assert implementation details.
They make refactors expensive and still miss real failures.

```typescript
// Bad: proves only that a mock method was called.
test("creates a todo", async () => {
  const db = { insert: mock.fn() };
  await createTodo({ db } as Context, { title: "Ship it" });
  assert.equal(db.insert.mock.callCount(), 1);
});

// Good: proves persisted behavior against the real database.
test("creates a todo", async () => {
  const context = await createTestContext();
  const todo = await createTodo(context, { title: "Ship it" });
  const found = await findTodoById(context, todo.id);

  assert.equal(found.title, "Ship it");
});
```

Prefer assertions about visible behavior:

- A row exists or does not exist.
- A unique constraint is enforced.
- A transaction rolls back.
- An HTTP response has the expected status and body.
- A restart leaves the service healthy on the same configured port.

## Test Context

Build test context the same way production context is built, with explicit test configuration.
Do not hide runtime defaults in the app code.

```typescript
export async function createTestContext(
  overrides: Partial<TestConfig> = {},
) {
  const config = {
    databaseUrl: process.env.TEST_DATABASE_URL,
    port: Number(process.env.TEST_PORT),
    publicBaseUrl: process.env.TEST_PUBLIC_BASE_URL,
    maxBodyBytes: Number(process.env.TEST_MAX_BODY_BYTES),
    jwtSecret: process.env.TEST_JWT_SECRET,
    ...overrides,
  };

  assertConfig(config);

  const context = await createContext(config);
  context.services.emailProvider = createMockEmailProvider();

  return context;
}
```

The helper can be convenient, but it should not invent missing configuration.
If a test needs a port, database URL, or feature flag, set it explicitly in the Docker/CI environment.

## Database State

Keep state isolation boring and reliable.

Use one of these patterns:

- Clean tables between tests in dependency order.
- Run each test in a transaction and roll it back.
- Recreate an ephemeral test database for suites that need full migration coverage.

```typescript
export async function cleanDatabase(context: Context) {
  await context.db.delete(todoEvents);
  await context.db.delete(todos);
}

test("rejects duplicate titles in a project", async () => {
  const context = await createTestContext();
  await cleanDatabase(context);

  await createTodo(context, { projectId: "alpha", title: "Deploy" });

  await assert.rejects(
    () => createTodo(context, { projectId: "alpha", title: "Deploy" }),
    ConflictError,
  );
});
```

Do not replace database behavior with an object literal.
Constraints, indexes, transactions, migrations, and connection behavior are exactly what the test suite needs to exercise.

## HTTP And Lifecycle Tests

Tests should use the same `createServer(context)` factory as production.
Lifecycle methods should guarantee readiness; tests should not sleep and hope.

```typescript
test("creates and retrieves a todo through HTTP", async () => {
  const context = await createTestContext();
  const server = createServer(context);

  try {
    await server.start();

    const createResponse = await fetch(`${server.url}/todos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Write tests" }),
    });

    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();

    const getResponse = await fetch(`${server.url}/todos/${created.id}`);
    assert.equal(getResponse.status, 200);
  } finally {
    await server.stop();
  }
});
```

Also test the operational contract:

- `start()` resolves only after readiness passes.
- `stop()` closes servers, sockets, pools, timers, and background work.
- `restart()` returns on the same configured ports after health checks pass.
- Stale background work cannot write through a closed context.

## Test Shape

Use focused test files that match ownership:

- Model tests cover domain rules and database behavior.
- Controller tests cover HTTP parsing, auth, validation, and response shape.
- Lifecycle tests cover start, stop, readiness, restart, and cleanup.
- External service tests use contract-shaped mocks for third-party APIs.

This is not a fight over "unit" versus "integration" labels.
The useful question is whether the test can catch a bug a user or operator would actually hit.

## Speed Without Lying

Real dependency tests can still be fast:

- Run project dependencies from `docker-compose.yml`.
- Use Compose services in CI instead of separate hand-written setup.
- Keep database schemas small and cleanup predictable.
- Run independent tests in parallel when the database isolation strategy supports it.
- Prefer transaction rollback or targeted cleanup over rebuilding the world after every assertion.

:::tip
**Optimize The Whole Feedback Loop**

A test that takes a few milliseconds longer but catches a real migration, constraint, or lifecycle bug is faster than a mock-heavy suite that sends you debugging later.
:::

The discipline is confidence through reality.
Use mocks where reality belongs to someone else.
