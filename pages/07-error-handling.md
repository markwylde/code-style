---
title: "Error Handling: Let It Bubble"
tagline: "Errors aren't bugs. They're information."
subtitle: "Why Catching Errors Everywhere Is Your Biggest Mistake"
date: "2025-04-03"
category: "Error Management"
tags: ["error-handling", "debugging", "nodejs", "architecture"]
order: 7
---

:::danger
**The Try-Catch Epidemic**

Look at most Node.js codebases and you'll see this pattern, try-catch blocks everywhere, swallowing errors and losing crucial debugging information.
:::

Look at most Node.js codebases and you'll see this pattern:

```javascript
async function createUser(userData) {
  try {
    const user = await db.insert(userData);
    try {
      await sendWelcomeEmail(user);
    } catch (emailError) {
      console.error('Email failed:', emailError);
      // Swallow error, continue anyway
    }
    return user;
  } catch (dbError) {
    console.error('Database error:', dbError);
    throw new Error('Failed to create user');  // Lost original error!
  }
}
```

This code:
- Swallows errors (email failure is hidden)
- Loses error context (original database error is gone)
- Makes debugging impossible (which operation failed?)
- Lies to callers (returns success when email failed)

## The Philosophy: Errors Are Information

:::info
**Core Philosophy**

Errors aren't problems to hide. They're information about what went wrong. When you catch and swallow errors, you're destroying information. Every catch block should either add value or let the error bubble up.
:::

Errors aren't problems to hide. They're information about what went wrong. When you catch and swallow errors, you're destroying information.

### Let It Bubble

```javascript
export async function createUser(context, userData) {
  // No try-catch! Let errors bubble
  const user = await context.db.insert(users).values(userData);
  await sendWelcomeEmail(context, user);
  return user;
}
```

If the database fails, the caller knows. If the email fails, the caller knows. The error includes:
- What failed (stack trace)
- Why it failed (error message)
- Where it failed (line number)

## The AppError Pattern

### The Problem with Generic Errors

```javascript
throw new Error('User not found');  // 500 error? 404? Who knows?
throw new Error('Invalid email');   // 400? 422? ¯\_(ツ)_/¯
```

### The Solution: Semantic Errors

```javascript
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    options?: { cause?: unknown }
  ) {
    // If your runtime supports ErrorOptions (Node 16+/TS lib.es2022.error), use cause
    // Otherwise drop the second arg and assign (this as any).cause = options?.cause
    // @ts-ignore
    super(message, options);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public details?: any, options?: { cause?: unknown }) {
    super(message, 400, 'VALIDATION_ERROR', options);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', options?: { cause?: unknown }) {
    super(message, 404, 'NOT_FOUND', options);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 409, 'CONFLICT', options);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', options?: { cause?: unknown }) {
    super(message, 403, 'FORBIDDEN', options);
  }
}
```

Now your errors carry meaning:

```javascript
export async function findUserById(context, userId) {
  const user = await context.db.query.users.findFirst({
    where: eq(users.id, userId)
  });

  if (!user) {
    throw new NotFoundError('User not found');  // Explicitly 404
  }

  return user;
}

export async function createUser(context, userData) {
  const existing = await findUserByEmail(context, userData.email);

  if (existing) {
    throw new ConflictError('Email already registered');  // Explicitly 409
  }

  // ...
}
```

## Centralized Error Handling

### One Place to Handle All Errors

Instead of try-catch everywhere, handle errors in one place:

```javascript
export function createServer(context) {
  return createHttpServer(async (request, response) => {
    try {
      // Route to appropriate handler
      await handleRequest(context, request, response);
    } catch (error) {
      // ONE place handles ALL errors
      handleError(error, response);
    }
  });
}

function handleError(error, response) {
  if (error instanceof ZodError) {
    response.writeHead(400, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.issues,
    }));
    return;
  }

  if (error instanceof AppError) {
    response.writeHead(error.statusCode, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      error: error.message,
      code: error.code,
      ...(error instanceof ValidationError && error.details ? { details: error.details } : {}),
    }));
    return;
  }

  if (error?.code === '23505') {
    response.writeHead(409, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Resource already exists', code: 'CONFLICT' }));
    return;
  }

  console.error('Unhandled error:', error);
  response.writeHead(500, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' }));
}
```

## Why Not Catch Everywhere?

### 1. **Information Loss**

```javascript
// BAD: Loses information
try {
  await someOperation();
} catch (error) {
  throw new Error('Operation failed');  // Original error gone!
}

// GOOD: Preserves information
await someOperation();  // Original error bubbles with full stack
```

### 2. **False Recovery**

```javascript
// BAD: Pretends to recover
try {
  user = await findUserById(context, userId);
} catch (error) {
  user = null;  // Is this recovery or hiding a bug?
}

if (!user) {
  // Did user not exist, or did database fail?
}
```

### 3. **Hidden Failures**

```javascript
// BAD: Swallows errors
try {
  await sendNotification(user);
} catch (error) {
  console.log('Notification failed');  // User never knows
}

// GOOD: Let caller decide
await sendNotification(user);  // Caller can handle or propagate
```

:::warning
**The Golden Rule**

Only catch errors when you can meaningfully handle them or add context. If you're catching just to re-throw or log, you're probably doing it wrong.
:::

## When TO Use Try-Catch

### 1. **Converting External Errors**

```javascript
export async function parseJsonBody(request) {
  const body = await readBody(request, 1_048_576);

  try {
    return JSON.parse(body);
  } catch (error) {
    // Convert parse error to our error type
    throw new ValidationError('Invalid JSON in request body');
  }
}
```

### 2. **Adding Context (Without Losing Information)**

Two good patterns:

1) Annotate and rethrow the original error (no wrapping):

```javascript
try {
  await doWork(context);
} catch (error) {
  if (error instanceof Error) {
    (error).context = { userId: context.user?.id };
  }
  throw error; // Preserve original type/stack
}
```

2) Translate to a domain error when semantics change, and preserve the cause:

```javascript
import { promises as fs } from 'fs';

export async function readText(path) {
  try {
    return await fs.readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File missing → domain-level NotFound
      throw new NotFoundError(`File not found: ${path}`, { cause: error });
    }
    throw error; // Unknown I/O error → bubble unchanged
  }
}
```

Avoid wrapping third‑party errors in a generic `AppError` unless you are intentionally converting them into your domain’s vocabulary.

### 3. **Resource Cleanup**

```javascript
export async function withTempFile(callback) {
  const tempPath = `/tmp/${Date.now()}.tmp`;

  try {
    await writeFile(tempPath, '');
    return await callback(tempPath);
  } finally {
    // Always cleanup, even if callback throws
    await unlink(tempPath).catch(() => {});
  }
}
```

## Error Patterns

### The Guard Pattern

Instead of nested try-catch, use early returns:

```javascript
// BAD: Nested error handling
export async function updateUser(context, userId, updates) {
  try {
    const user = await findUserById(context, userId);
    try {
      const validated = UpdateUserSchema.parse(updates);
      try {
        return await saveUser(context, userId, validated);
      } catch (saveError) {
        throw new Error('Failed to save');
      }
    } catch (validationError) {
      throw new ValidationError('Invalid data');
    }
  } catch (findError) {
    throw new NotFoundError('User not found');
  }
}

// GOOD: Let errors bubble naturally
export async function updateUser(context, userId, updates) {
  const user = await findUserById(context, userId);  // Throws NotFoundError
  const validated = UpdateUserSchema.parse(updates);  // Throws ZodError
  return await saveUser(context, userId, validated);  // Throws database errors
}
```

### The Transaction Pattern

Ensure cleanup even when errors occur:

```javascript
export async function withTransaction(context, callback) {
  const tx = await context.db.transaction();
  const txContext = { ...context, db: tx };

  try {
    const result = await callback(txContext);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;  // Re-throw original error
  }
}

// Usage
const result = await withTransaction(context, async (txContext) => {
  // Any error here causes automatic rollback
  await createUser(txContext, userData);
  await createAccount(txContext, accountData);
});
```

### The Validation Pattern

Validate early, throw immediately:

```javascript
export async function createPost(context, postData, userId) {
  // Validate input first
  const validated = CreatePostSchema.parse(postData);

  // Check permissions next
  const user = await findUserById(context, userId);
  if (!user.canCreatePosts) {
    throw new ForbiddenError('User cannot create posts');
  }

  // Then do the work
  return await context.db.insert(posts).values({
    ...validated,
    authorId: userId
  });
}
```

## Production Considerations

### Client-Friendly Errors

```javascript
class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public userMessage?: string  // Safe for users
  ) {
    super(message);
  }
}

// Usage
throw new ValidationError(
  'Invalid email format: missing @ symbol',  // For logs
  400,
  'INVALID_EMAIL',
  'Please enter a valid email address'  // For users
);
```

## Common Anti-Patterns

### 1. **Catching to Log**

```javascript
// BAD: Catching just to log
try {
  await doSomething();
} catch (error) {
  console.error(error);
  throw error;  // If you're re-throwing, why catch?
}

// GOOD: Log in central handler
await doSomething();  // Central handler will log
```

### 2. **Stringly-Typed Errors**

```javascript
// BAD: String comparison
if (error.message === 'User not found') {
  // Fragile! Message might change
}

// GOOD: Type checking
if (error instanceof NotFoundError) {
  // Robust! Type won't change
}
```

### 3. **Silent Failures**

```javascript
// BAD: Silently continuing
let user;
try {
  user = await findUser(id);
} catch {
  // Silently continue with undefined user
}

// GOOD: Explicit handling
const user = await findUser(id).catch(() => null);
if (!user) {
  throw new NotFoundError('User required for this operation');
}
```

:::success
**Production Ready Error Handling**

A well-designed error handling strategy catches real bugs in development, provides meaningful feedback to users, and gives you the information needed to debug production issues quickly.
:::

## Summary

The bubble-up approach gives you:

### **Debuggability**
Full stack traces show exactly what failed and where.

### **Predictability**
Errors have consistent types and status codes.

### **Simplicity**
One error handler instead of try-catch everywhere.

### **Honesty**
When something fails, the caller knows about it.

Remember: **Errors are not enemies to be suppressed. They're information about what went wrong.** Let them bubble up to where they can be handled properly.
