---
title: "Models vs Controllers"
tagline: "HTTP adapters meet business logic."
subtitle: "True Separation of Concerns"
date: "2025-04-03"
category: "Architecture"
tags: ["models", "controllers", "separation-of-concerns", "mvc"]
order: 6
---

:::success
Controllers are HTTP adapters. Models are your business. That's it. That's the separation.
:::

### What Controllers Do

Controllers translate between HTTP and your application:

```typescript
// controllers/users/post.ts
import { z } from 'zod';
import type { Handler } from '../../createServer';
import { CreateUserSchema } from '../../schemas/users';

export const schema = z.object({
  body: CreateUserSchema
});

export async function handler({ context, response, body }: Handler<typeof schema>) {
  // 1. Body arrives parsed & validated by the schema above
  // 2. Call the model (business logic)
  const user = await createUser(context, body);

  // 3. Format HTTP output
  response.statusCode = 201;
  response.end(JSON.stringify(user));
}
```

That's it. Four responsibilities:
1. Declare the HTTP contract with a Zod schema
2. Receive already parsed, validated data from the router
3. Call the model
4. Send the response

### What Models Do

Models own your business logic and data:

```javascript
export async function createUser(context, userData) {
  // Check business rules
  const existing = await context.db.query.users.findFirst({
    where: eq(users.email, userData.email)
  });

  if (existing) {
    throw new ConflictError('Email already registered');
  }

  // Apply business logic
  const passwordHash = await hashPassword(userData.password);

  // Persist data
  const [user] = await context.db
    .insert(users)
    .values({
      email: userData.email,
      passwordHash,
      createdAt: new Date()
    })
    .returning();

  // Return domain object
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt
  };
}
```

Models handle:
- Business rule validation
- Data persistence
- Domain logic
- Data transformation

Side effects (email, queues, external APIs) should be orchestrated by controllers or dedicated services, not inside models. This keeps models focused on domain state and makes side effects explicit at the edges.

```typescript
// Controller/service orchestrates side effects
import { z } from 'zod';
import type { Handler } from '../../createServer';
import { CreateUserSchema } from '../../schemas/users';

export const schema = z.object({
  body: CreateUserSchema
});

export async function handler({ context, response, body }: Handler<typeof schema>) {
  const user = await createUser(context, body);
  await sendWelcomeEmail(context, user); // side effect outside the model

  response.statusCode = 201;
  response.end(JSON.stringify(user));
}
```
- Data transformation

## Why This Separation Matters

### 1. **Testing Is Clearer**

```javascript
// Test the model (business logic)
it('should reject duplicate emails', async () => {
  await createUser(context, { email: 'test@example.com' });

  await assert.rejects(
    () => createUser(context, { email: 'test@example.com' }),
    ConflictError
  );
});

// Test the controller (HTTP handling)
it('should return 409 for duplicate emails', async () => {
  await createUser(context, { email: 'test@example.com' });

  const response = await fetch(`${server.url}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com' })
  });

  assert.equal(response.status, 409);
});
```

Model tests verify business logic. Controller tests verify HTTP behavior.

### 2. **Reusability**

```typescript
// Use the same model from different interfaces

// REST API
import { z } from 'zod';
import type { Handler } from '../../createServer';
import { CreateUserSchema } from '../../schemas/users';

export const schema = z.object({
  body: CreateUserSchema
});

export async function handler({ context, response, body }: Handler<typeof schema>) {
  const user = await createUser(context, body);
  response.end(JSON.stringify(user));
}

// GraphQL resolver
export const resolvers = {
  Mutation: {
    createUser: async (_, args, { context }) => {
      return createUser(context, args.input);
    }
  }
};

// CLI command
export async function createUserCommand(context, args) {
  const user = await createUser(context, {
    email: args.email,
    password: args.password
  });
  console.log('User created:', user.id);
}
```

One model, many interfaces. Write once, use everywhere.

### 3. **Evolution**

When requirements change, you know exactly where to look:

- **"We need to validate email format"** → Controller (input validation)
- **"Emails must be unique per organization"** → Model (business rule)
- **"Return user data as XML"** → Controller (output format)
- **"Hash passwords with Argon2"** → Model (domain logic)

## The Data Flow

### Request → Controller → Model → Controller → Response

```javascript
// 1. REQUEST arrives
POST /users
{ "email": "test@example.com", "name": "Test" }

// 2. CONTROLLER parses and validates
const userData = CreateUserSchema.parse(requestBody);

// 3. MODEL applies business logic
const user = await createUser(context, userData);

// 4. CONTROLLER formats response
response.end(JSON.stringify(user));

// 5. RESPONSE sent
201 Created
{ "id": "123", "email": "test@example.com" }
```

Each layer has one job. No confusion. No mixing.

## Common Mistakes

### 1. **Controllers Touching the Database**

```typescript
// BAD: Controller directly queries database
import { z } from 'zod';
import type { Handler } from '../../createServer';

export const schema = z.object({
  params: z.object({
    userId: z.string().uuid()
  })
});

export async function handler({ context, response, params }: Handler<typeof schema>) {
  const user = await context.db.query.users.findFirst({
    where: eq(users.id, params.userId)
  });
  response.end(JSON.stringify(user));
}
```

```typescript
// GOOD: Controller calls model
import { z } from 'zod';
import type { Handler } from '../../createServer';

export const schema = z.object({
  params: z.object({
    userId: z.string().uuid()
  })
});

export async function handler({ context, response, params }: Handler<typeof schema>) {
  const user = await findUserById(context, params.userId);
  response.end(JSON.stringify(user));
}
```

Why? When you need to add caching, audit logging, or business rules, you'll have to find every place that queries users. With models, you change one function.

### 2. **Models Knowing About HTTP**

```javascript
// BAD: Model returns HTTP-specific data
export async function createUser(context, userData) {
  // ...
  return {
    statusCode: 201,
    body: { user },
    headers: { 'X-User-ID': user.id }
  };
}

// GOOD: Model returns domain data
export async function createUser(context, userData) {
  // ...
  return user;  // Just the user, no HTTP concepts
}
```

Why? Your model should work whether it's called from HTTP, GraphQL, CLI, or a background job.

### 3. **Mixing Validation Layers**

```typescript
// BAD: Business validation in controller
import { z } from 'zod';
import type { Handler } from '../../createServer';
import { CreateUserSchema } from '../../schemas/users';

export const schema = z.object({
  body: CreateUserSchema
});

export async function handler({ context, response, body }: Handler<typeof schema>) {
  // This is business logic!
  if (body.age < 18) {
    throw new ValidationError('Must be 18 or older');
  }

  const user = await createUser(context, body);

  response.statusCode = 201;
  response.end(JSON.stringify(user));
}
```

```typescript
// GOOD: Input validation in controller, business rules in model
import { z } from 'zod';
import type { Handler } from '../../createServer';
import { CreateUserSchema } from '../../schemas/users';

export const schema = z.object({
  body: CreateUserSchema
});

export async function handler({ context, response, body }: Handler<typeof schema>) {
  // Schema handles shape; model handles business rules
  const user = await createUser(context, body);

  response.statusCode = 201;
  response.end(JSON.stringify(user));
}

export async function createUser(context, userData) {
  // Model: validate business rules
  if (userData.age < 18) {
    throw new ValidationError('Must be 18 or older');
  }
  // ...
}
```


## The Router Layer

Use `URLPattern` for route matching. This keeps routing declarative and aligned with the spec.

```javascript
const routes = [
  {
    method: 'GET',
    pattern: new URLPattern({ pathname: '/users/:userId' }),
    controller: import('./controllers/users/[userId]/get')
  },
  {
    method: 'POST',
    pattern: new URLPattern({ pathname: '/users' }),
    controller: import('./controllers/users/post')
  }
];

for (const route of routes) {
  if (route.method !== request.method) continue;

  const match = route.pattern.exec({ pathname });
  if (!match) continue;

  const controller = await route.controller;
  const paramsSchema = controller.schema.shape?.params;
  const params = paramsSchema
    ? paramsSchema.parse(match.pathname.groups ?? {})
    : {};

  await controller.handler({ context, request, response, params });
  return;
}
```

No framework. No hidden middleware. Just explicit routing and typed validation.

## Complex Operations

### Composing Models

Models can call other models to build complex operations:

```javascript
export async function registerUser(context, registrationData) {
  // Compose multiple model operations
  const user = await createUser(context, {
    email: registrationData.email,
    password: registrationData.password
  });

  const organization = await createOrganization(context, {
    name: registrationData.organizationName,
    ownerId: user.id
  });

  await addUserToOrganization(context, {
    userId: user.id,
    organizationId: organization.id,
    role: 'owner'
  });

  return { user, organization };
}
```

Each model function does one thing. Compose them for complex operations.

### Transaction Boundaries

Models define transaction boundaries:

```javascript
export async function transferCredits(context, fromUserId, toUserId, amount) {
  return withTransaction(context, async (txContext) => {
    // All operations in one transaction
    const fromUser = await deductCredits(txContext, fromUserId, amount);
    const toUser = await addCredits(txContext, toUserId, amount);

    await createTransferRecord(txContext, {
      fromUserId,
      toUserId,
      amount,
      timestamp: new Date()
    });

    return { fromUser, toUser };
  });
}
```

Controllers don't know about transactions. Models handle data consistency.

## Authorization Patterns

### Where Does Authorization Belong?

**Authentication** → Controller (who is making the request?)
**Authorization** → Controller (can they access this endpoint?)
**Business Rules** → Model (do they meet requirements?)

```typescript
// Controller: Authentication & Authorization
import { z } from 'zod';
import type { Handler } from '../../createServer';

export const schema = z.object({
  params: z.object({
    userId: z.string().uuid()
  })
});

export async function handler({ context, request, response, params }: Handler<typeof schema>) {
  // Authentication: Who are you?
  const session = await requireSession(context, request);

  // Authorization: Can you access this endpoint?
  if (!session.isAdmin && session.userId !== params.userId) {
    throw new ForbiddenError('Cannot delete other users');
  }

  // Model handles business rules
  await deleteUser(context, params.userId, session.userId);

  response.statusCode = 204;
  response.end();
}

// Model: Business Rules
export async function deleteUser(context, userId, deletedBy) {
  const user = await findUserById(context, userId);

  // Business rule: Can't delete users with active subscriptions
  if (user.subscriptionActive) {
    throw new ValidationError('Cannot delete user with active subscription');
  }

  // Proceed with deletion
  await context.db.delete(users).where(eq(users.id, userId));

  // Audit log
  await createAuditLog(context, {
    action: 'user.deleted',
    targetId: userId,
    performedBy: deletedBy
  });
}
```

## The Payoff

This separation gives you:

### 1. **Single Responsibility**
Each layer has one job. Controllers handle HTTP. Models handle business logic.

### 2. **Testability**
Test business logic without HTTP. Test HTTP handling without business logic.

### 3. **Reusability**
Same models work for REST, GraphQL, CLI, background jobs.

### 4. **Maintainability**
When requirements change, you know exactly where to make changes.

### 5. **Debuggability**
When something breaks, the error tells you which layer failed.

## Summary

The model-controller separation is simple:
- **Controllers** are thin HTTP adapters
- **Models** own all business logic and data
- **Never** let controllers touch the database
- **Never** let models know about HTTP
- **Always** keep the layers separate

It's more code upfront, you write both a controller and a model instead of one fat controller. But when your application grows, you'll thank yourself for keeping the layers clean.
