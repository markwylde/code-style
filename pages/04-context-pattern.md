---
title: "Context Pattern"
tagline: "Build the dependency graph once. Pass it everywhere."
subtitle: "The First Piece Of The Core"
date: "2025-04-03"
category: "Build The Core"
tags: ["context", "dependency-injection", "testing", "architecture"]
order: 4
---

:::info
Context is the project graph: config, database handles, service adapters, lifecycle state, and cleanup. It is ordinary data passed into ordinary functions.
:::

The context pattern gives the project dependency injection without a container. No decorators, no global singletons, no implicit imports. The entrypoint builds one context, hands it to the server, and every meaningful application function accepts it as the first parameter.

```typescript
const config = loadConfig(process.env);
const context = await createContext(config);
const server = createServer(context);

await server.start();
```

From there, the same object flows through controllers, models, services, tests, and background work:

```typescript
export async function findUserById(context: Context, userId: string) {
  return context.db.query.users.findFirst({
    where: eq(users.id, userId),
  });
}
```

## What Belongs In Context

Context should contain the runtime things a function cannot honestly create for itself.

- `config`: already validated configuration
- `db`: database client or ORM handle
- `services`: adapters for external systems such as email, payments, object storage, or queues
- `state`: lifecycle signal for stopping, closed, and instance identity
- `destroy`: cleanup for pools, timers, clients, and other owned resources

It should not become a request bag. Do not attach `currentUser`, request bodies, permissions, or temporary controller data to context. Those values belong in function parameters.

```typescript
export type Context = {
  db: Database;
  config: Config;
  services: Services;
  state: ContextState;
  destroy: () => Promise<void>;
};

export type ContextState = {
  instanceId: string;
  status: "live" | "closing" | "closed";
};

export type Services = {
  emailProvider?: EmailProvider;
  paymentProvider?: PaymentProvider;
};
```

Use `type` aliases for project shapes. Avoid `interface`; declaration merging is implicit global behavior and does not fit this style.

## Why Not Globals

Global resources look convenient until tests, restarts, and multiple server instances arrive.

```typescript
// db.ts
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);

// models/users.ts
import { db } from "../db.ts";

export async function createUser(input: CreateUserInput) {
  return db.insert(users).values(input).returning();
}
```

This hides the database dependency, hardwires environment access into module loading, and makes cleanup somebody else's problem. It also makes tests fight shared process state.

The context version is explicit:

```typescript
export async function createUser(context: Context, input: CreateUserInput) {
  return context.db.insert(users).values(input).returning();
}
```

Now the caller controls which database, which services, and which lifecycle instance are being used.

## Building Context

`createContext` owns resource construction. Config is already parsed before this function is called; do not use runtime fallback values for ports, secrets, limits, or service settings.

```typescript
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./db/schema.ts";
import type { Config, Context, ContextState } from "./types.ts";

type Cleanup = () => Promise<void>;

export async function createContext(config: Config): Promise<Context> {
  const cleanup: Cleanup[] = [];
  const state: ContextState = {
    instanceId: randomUUID(),
    status: "live",
  };

  const pool = new Pool({ connectionString: config.databaseUrl });
  cleanup.push(async () => {
    await pool.end();
  });

  const db = drizzle(pool, { schema });

  return {
    db,
    config,
    state,
    services: {
      emailProvider: createEmailProvider(config),
      paymentProvider: createPaymentProvider(config),
    },
    async destroy() {
      if (state.status === "closed") return;

      state.status = "closing";
      for (const destroy of cleanup.toReversed()) {
        await destroy();
      }
      state.status = "closed";
    },
  };
}
```

The cleanup list is intentionally boring. Every resource created by context registers one matching cleanup function. When `destroy()` resolves, pools are closed, timers are cleared, and external clients have been shut down.

## Config Is Not Context's Job

Context receives config; it does not invent config. Load and validate configuration at startup, then fail fast if a required value is missing.

```typescript
import { z } from "zod";

const ConfigSchema = z.object({
  port: z.coerce.number().int().min(0),
  databaseUrl: z.string().min(1),
  publicBaseUrl: z.string().url(),
  jwtSecret: z.string().min(1),
  maxBodyBytes: z.coerce.number().int().positive(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  return ConfigSchema.parse({
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    publicBaseUrl: env.PUBLIC_BASE_URL,
    jwtSecret: env.JWT_SECRET,
    maxBodyBytes: env.MAX_BODY_BYTES,
  });
}
```

Sample values belong in `.env.example` and documentation. Runtime defaults in application code hide deployment mistakes.

## Context In Tests

Tests use the same pattern as production. Internal dependencies should be real whenever practical, especially the database. External systems can be replaced with test adapters.

```typescript
import test from "node:test";
import assert from "node:assert/strict";

test("createUser enforces unique email addresses", async () => {
  const context = await createTestContext({
    services: {
      emailProvider: {
        send: async () => ({ messageId: "test-message" }),
      },
    },
  });

  try {
    await createUser(context, {
      email: "ada@example.com",
      password: "correct horse battery staple",
    });

    await assert.rejects(
      () =>
        createUser(context, {
          email: "ada@example.com",
          password: "another password",
        }),
      ConflictError,
    );
  } finally {
    await context.destroy();
  }
});
```

This catches real database constraints, transaction behavior, SQL mistakes, and pool cleanup issues. The email provider is still a fake because the project does not own SendGrid, SES, or any other third-party service.

## Scoped Overrides

Sometimes a function needs the same context with one dependency narrowed. Transactions are the common case.

```typescript
export async function withTransaction<T>(
  context: Context,
  callback: (context: Context) => Promise<T>,
): Promise<T> {
  return context.db.transaction(async (tx) => {
    const txContext: Context = {
      ...context,
      db: tx,
    };

    return callback(txContext);
  });
}
```

The override is local and visible. The original context is still the source of config, services, and lifecycle state.

## Background Work

Anything started from the server must respect context lifecycle. If context is closing or closed, it should stop before touching databases, queues, or files.

```typescript
export async function sendDigest(context: Context, userId: string) {
  if (context.state.status !== "live") {
    return;
  }

  const digest = await buildDigest(context, userId);

  if (context.state.status !== "live") {
    return;
  }

  await context.services.emailProvider?.send({
    to: digest.email,
    subject: digest.subject,
    html: digest.html,
  });
}
```

For work that must survive restarts, persist it to a durable queue and resume it after a fresh context is created.

## Rules Of Thumb

- Pass `context` as the first argument to application functions.
- Never import a singleton context from another module.
- Keep request-specific data out of context.
- Register cleanup for every resource context creates.
- Mock third-party systems, not internal systems the project owns.
- Rebuild a fresh context explicitly by stopping the old server, creating a new context, creating a new server, and starting it.

Context is dependency injection reduced to its useful core: pass the object, make dependencies visible, and clean up what you create.
