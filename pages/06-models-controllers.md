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

```javascript
export async function createUserController(context, request, response) {
  // 1. Parse HTTP input
  const body = await readBody(request);
  const data = JSON.parse(body);

  // 2. Validate HTTP input
  const userData = CreateUserSchema.parse(data);

  // 3. Call the model (business logic)
  const user = await createUser(context, userData);

  // 4. Format HTTP output
  response.statusCode = 201;
  response.end(JSON.stringify(user));
}
```

That's it. Four responsibilities:
1. Parse the request
2. Validate input
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

```javascript
// Controller/service orchestrates side effects
export async function postUsersController(context, request, response) {
  const data = CreateUserSchema.parse(JSON.parse(await readBody(request)));

  const user = await createUser(context, data);
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

```javascript
// Use the same model from different interfaces

// REST API
export async function createUserController(context, request, response) {
  const user = await createUser(context, data);
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

```javascript
// BAD: Controller directly queries database
export async function getUserController(context, request, response) {
  const user = await context.db.query.users.findFirst({
    where: eq(users.id, userId)
  });
  response.end(JSON.stringify(user));
}

// GOOD: Controller calls model
export async function getUserController(context, request, response) {
  const user = await findUserById(context, userId);
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

```javascript
// BAD: Business validation in controller
export async function createUserController(context, request, response) {
  const data = JSON.parse(body);

  // This is business logic!
  if (data.age < 18) {
    throw new ValidationError('Must be 18 or older');
  }

  const user = await createUser(context, data);
}

// GOOD: Input validation in controller, business rules in model
export async function createUserController(context, request, response) {
  // Controller: validate input shape
  const data = CreateUserSchema.parse(JSON.parse(body));

  // Model will handle business rules
  const user = await createUser(context, data);
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

### Why URLPattern?

```javascript
// Traditional string matching
if (request.url === '/users') { /* ... */ }
if (request.url.startsWith('/users/')) { /* ... */ }
if (request.url.match(/^\/users\/(\d+)$/)) { /* ... */ }

// URLPattern - built into Node.js
const pattern = new URLPattern({ pathname: '/users/:userId' });
const match = pattern.exec(request.url);
if (match) {
  const userId = match.pathname.groups.userId;
}
```

URLPattern is:
- Built into Node.js (no dependencies)
- Type-safe (TypeScript knows about groups)
- Standard (works in browsers too)
- Fast (C++ implementation)

### Building Routes

```javascript
const routes = [
  {
    method: 'GET',
    pattern: new URLPattern({ pathname: '/users/:userId' }),
    handler: async (context, request, response, match) => {
      const userId = match.pathname.groups.userId;
      await getUserController(context, request, response, userId);
    }
  },
  {
    method: 'POST',
    pattern: new URLPattern({ pathname: '/users' }),
    handler: postUsersController
  }
];

// Simple router
for (const route of routes) {
  if (route.method !== request.method) continue;

  const match = route.pattern.exec(url);
  if (!match) continue;

  await route.handler(context, request, response, match);
  return;
}
```

No framework. No magic. Just a loop.

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

```javascript
// Controller: Authentication & Authorization
export async function deleteUserController(context, request, response, userId) {
  // Authentication: Who are you?
  const session = await requireSession(context, request);

  // Authorization: Can you access this endpoint?
  if (!session.isAdmin && session.userId !== userId) {
    throw new ForbiddenError('Cannot delete other users');
  }

  // Model handles business rules
  await deleteUser(context, userId, session.userId);

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

It's more code upfront—you write both a controller and a model instead of one fat controller. But when your application grows, you'll thank yourself for keeping the layers clean.

Next, we'll explore error handling—why we let errors bubble up instead of catching them everywhere.
