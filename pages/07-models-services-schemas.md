---
title: "Models Services And Schemas"
tagline: "Put data rules, side effects, and contracts in the right files."
subtitle: "The Inner Layers Of The Core"
date: "2025-04-03"
category: "Build The Core"
tags: ["models", "services", "schemas", "domain", "zod"]
order: 7
---

:::success
Models own domain data. Services own external protocols and multi-step workflows. Schemas define the shapes that cross boundaries.
:::

After routing hands work to a controller, the controller should call into small, explicit modules:

- `models/` for database access and domain invariants
- `services/` for external systems and orchestration with side effects
- `schemas/` for reusable Zod contracts and inferred types

The separation is practical. It keeps database queries out of controllers, keeps HTTP out of models, and keeps cross-boundary side effects visible.

## Models

Models are the single source of truth for how domain data is read, written, validated, and transformed.

Models should:

- Accept `Context` as the first parameter.
- Own all `context.db` usage.
- Apply business rules and invariants.
- Handle pagination, filtering, search, relationships, and transactions.
- Return plain data objects.
- Throw semantic errors such as `NotFoundError`, `ConflictError`, and `ValidationError`.

Models should not:

- Read HTTP requests or write HTTP responses.
- Check sessions, permissions, or cohorts.
- Register OpenAPI metadata.
- Trigger email, queues, payments, webhooks, or other third-party effects.

```typescript
// models/users.ts
import { eq } from "drizzle-orm";
import { users } from "../db/schema.ts";
import { ConflictError, NotFoundError } from "../errors.ts";
import type { Context } from "../types.ts";
import type { CreateUserInput, User } from "../schemas/users.ts";

export async function findUserById(
  context: Context,
  userId: string,
): Promise<User> {
  const user = await context.db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  };
}

export async function createUser(
  context: Context,
  input: CreateUserInput,
): Promise<User> {
  const existing = await context.db.query.users.findFirst({
    where: eq(users.email, input.email),
  });

  if (existing) {
    throw new ConflictError("Email already registered");
  }

  const passwordHash = await hashPassword(input.password);

  const [user] = await context.db
    .insert(users)
    .values({
      email: input.email,
      name: input.name,
      passwordHash,
      createdAt: new Date(),
    })
    .returning();

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  };
}
```

The model returns the domain data the application needs. It does not know whether the caller is HTTP, a CLI, a worker, or a test.

## Queries And Options

Controllers validate incoming query strings, then pass typed options to models. Models decide what those options mean.

```typescript
export type ListUsersOptions = {
  page?: number;
  limit?: number;
  search?: string;
};

export type ListUsersResult = {
  users: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
};

export async function listUsers(
  context: Context,
  options: ListUsersOptions,
): Promise<ListUsersResult> {
  const page = options.page ?? 1;
  const limit = Math.min(options.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  const rows = await context.db
    .select()
    .from(users)
    .limit(limit)
    .offset(offset);

  return {
    users: rows.map(toUser),
    pagination: {
      page,
      limit,
      total: await countUsers(context, { search: options.search }),
    },
  };
}
```

Runtime defaults for application config are not allowed. Local model defaults for optional behavior, such as pagination when no query parameter was supplied, are fine because they are domain behavior rather than deployment configuration.

## Transactions

Models and services define transaction boundaries. Controllers should not manage transactions directly.

```typescript
export async function withTransaction<T>(
  context: Context,
  callback: (context: Context) => Promise<T>,
): Promise<T> {
  return context.db.transaction(async (tx) => {
    return callback({
      ...context,
      db: tx,
    });
  });
}

export async function transferCredits(
  context: Context,
  input: TransferCreditsInput,
) {
  return withTransaction(context, async (txContext) => {
    const fromUser = await deductCredits(txContext, input.fromUserId, input.amount);
    const toUser = await addCredits(txContext, input.toUserId, input.amount);

    await createTransferRecord(txContext, {
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      amount: input.amount,
    });

    return { fromUser, toUser };
  });
}
```

The transaction is visible at the model/service layer where data consistency is being protected.

## Services

Services have two common jobs:

- Adapt external protocols behind explicit functions.
- Orchestrate multi-step workflows, especially when side effects sit beside model calls.

A provider adapter can be very small:

```typescript
// services/email.ts
import type { Context } from "../types.ts";
import type { User } from "../schemas/users.ts";

export async function sendWelcomeEmail(context: Context, user: User) {
  const provider = context.services.emailProvider;

  if (!provider) {
    throw new Error("Email provider is not configured");
  }

  await provider.send({
    to: user.email,
    subject: "Welcome",
    html: `<h1>Welcome ${user.name}</h1>`,
  });
}
```

A workflow service can compose models and side effects:

```typescript
// services/registration.ts
import { createOrganization } from "../models/organizations.ts";
import { createUser } from "../models/users.ts";
import { addUserToOrganization } from "../models/organizationMembers.ts";
import { sendWelcomeEmail } from "./email.ts";
import type { Context } from "../types.ts";
import type { RegisterUserInput } from "../schemas/users.ts";

export async function registerUser(
  context: Context,
  input: RegisterUserInput,
) {
  const user = await createUser(context, {
    email: input.email,
    name: input.name,
    password: input.password,
  });

  const organization = await createOrganization(context, {
    name: input.organizationName,
    ownerId: user.id,
  });

  await addUserToOrganization(context, {
    userId: user.id,
    organizationId: organization.id,
    role: "owner",
  });

  await sendWelcomeEmail(context, user);

  return { user, organization };
}
```

This keeps `createUser` focused on user data. The registration workflow is the place where user creation, organization creation, membership, and email become one use case.

## Schemas

Use Zod schemas for values that cross boundaries: HTTP input/output, shared model input, external service payloads, and important domain shapes.

`schemas/` is for reusable contracts. A model may also define a schema nearby when it is only used by that model.

```typescript
// schemas/users.ts
import { z } from "zod";

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  createdAt: z.date(),
});

export const CreateUserRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(12),
});

export const RegisterUserRequestSchema = CreateUserRequestSchema.extend({
  organizationName: z.string().min(1),
});

export const UserResponseSchema = UserSchema;

export type User = z.infer<typeof UserSchema>;
export type CreateUserInput = z.infer<typeof CreateUserRequestSchema>;
export type RegisterUserInput = z.infer<typeof RegisterUserRequestSchema>;
```

Do not confuse `schemas/` with `db/schema.ts`. Database schema describes tables and columns. Zod schemas describe runtime data contracts.

## External Shape vs Internal Shape

OpenAPI schemas describe the public API. Model types describe the domain. They can be the same for simple resources, but they do not have to be.

```typescript
export const UserResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
});

export type UserResponse = z.infer<typeof UserResponseSchema>;

export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
}
```

Keep the mapping explicit when the API should hide fields, rename fields, flatten relationships, or format values differently.

## Controllers Use The Layers

A controller should read like transport coordination.

```typescript
// controllers/users/post.ts
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

  const result = await registerUser(context, body);

  sendJsonValidated(response, 201, {
    user: toUserResponse(result.user),
    organization: result.organization,
  }, schema.response);
}
```

The controller validates HTTP input and formats HTTP output. The service orchestrates the use case. The models handle data rules and database writes.

## Authorization Boundary

Authentication and authorization belong in controllers or explicit auth helpers called by controllers. Models should assume the caller is authorized.

```typescript
export async function handler({
  context,
  request,
  response,
  params,
}: Handler<typeof schema>) {
  const session = await requireSession(context, request);

  if (!session.isAdmin && session.userId !== params.userId) {
    throw new ForbiddenError("Cannot delete another user");
  }

  await deleteUser(context, params.userId);

  response.writeHead(204);
  response.end();
}
```

The model still enforces domain rules:

```typescript
export async function deleteUser(context: Context, userId: string) {
  const user = await findUserById(context, userId);

  if (user.subscriptionStatus === "active") {
    throw new ValidationError("Cannot delete user with an active subscription");
  }

  await context.db.delete(users).where(eq(users.id, userId));
}
```

Permission is a caller question. Subscription state is a domain question.

## Testing

Test each layer at the level where it earns confidence.

- Model tests use real internal dependencies and assert business rules, database behavior, and transactions.
- Service tests verify external adapter calls and multi-step workflows.
- Route tests hit the HTTP server and verify validation, auth, response shape, and error translation.

```typescript
test("createUser rejects duplicate emails", async () => {
  const context = await createTestContext();

  try {
    await createUser(context, {
      email: "ada@example.com",
      name: "Ada",
      password: "correct horse battery staple",
    });

    await assert.rejects(
      () =>
        createUser(context, {
          email: "ada@example.com",
          name: "Ada Again",
          password: "another correct password",
        }),
      ConflictError,
    );
  } finally {
    await context.destroy();
  }
});
```

Use real databases for model behavior. Mock third-party providers by swapping service adapters in context.

## Common Mistakes

```typescript
// Bad: controller reaches into tables
const user = await context.db.query.users.findFirst({
  where: eq(users.id, params.userId),
});
```

```typescript
// Good: controller calls a model
const user = await findUserById(context, params.userId);
```

```typescript
// Bad: model returns HTTP
return {
  statusCode: 201,
  body: user,
};
```

```typescript
// Good: model returns domain data
return user;
```

```typescript
// Bad: model sends cross-boundary side effects
await context.services.emailProvider.send(welcomeEmail);
```

```typescript
// Good: service composes model and side effect explicitly
const user = await createUser(context, input);
await sendWelcomeEmail(context, user);
```

## File Placement

- `db/schema.ts`: table definitions and database-level defaults.
- `models/users.ts`: user data access and user domain rules.
- `services/email.ts`: email provider adapter.
- `services/registration.ts`: registration workflow that composes models and email.
- `schemas/users.ts`: reusable Zod contracts and inferred types.
- `controllers/users/post.ts`: HTTP input, auth, service/model call, HTTP response.

When adding a feature, start with the model functions and schemas that describe the data. Then add services if the workflow crosses a boundary or coordinates multiple steps. Finally wire the controller and route.

The core stays simple when each file has a clear reason to exist.
