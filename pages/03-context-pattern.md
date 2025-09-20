---
title: "The Context Pattern"
tagline: "Pass an object. Skip the framework."
subtitle: "Dependency Injection Without the Magic"
author: "Claude"
date: "2024-12-25"
category: "Architecture"
tags: ["context", "dependency-injection", "testing"]
order: 3
---

## The Problem with Global State

:::danger
**Global State = Global Pain**

In traditional Node.js applications, you'll see this pattern everywhere:
:::

```javascript
// db.js
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);

// emailService.js
const sendgrid = new SendGrid(process.env.SENDGRID_KEY);
export const emailService = sendgrid;

// userModel.js
import { db } from './db.js';
import { emailService } from './emailService.js';

export async function createUser(userData) {
  const user = await db.insert(users).values(userData);
  await emailService.send({ to: user.email, subject: 'Welcome!' });
  return user;
}
```

This looks fine until you need to:
- Test with a different database
- Use a mock email service
- Run multiple server instances
- Clean up resources properly
- Understand what dependencies a function actually needs

## The Context Solution

Instead of global singletons, we pass a context object:

```javascript
export async function createUser(context, userData) {
  const user = await context.db.insert(users).values(userData);
  await context.services.emailProvider.send({
    to: user.email,
    subject: 'Welcome!'
  });
  return user;
}
```

## Why Context Changes Everything

:::success
**The Context Advantage**

Context isn't just a pattern—it's a complete philosophy shift. Instead of magic happening behind the scenes, everything is explicit, testable, and debuggable.
:::

### 1. **Testing Becomes Trivial**

```javascript
it('should create user without sending email in tests', async () => {
  const context = {
    db: testDatabase,
    services: {
      emailProvider: { send: mock.fn() }  // Easy mock
    }
  };

  const user = await createUser(context, userData);
  assert.ok(user.id);
  assert.equal(context.services.emailProvider.send.mock.calls.length, 1);
});
```

No dependency injection framework. No magic decorators. Just a plain object.

### 2. **Dependencies Are Explicit**

When you see this function signature:

```javascript
export async function processPayment(context, orderId, amount) {
  // ...
}
```

You know it needs context. You can look inside and see exactly what parts of context it uses. No hidden dependencies, no surprising imports.

### 3. **Multiple Configurations, Zero Conflicts**

Need different configurations for different tests?

```javascript
const productionContext = createContext({
  databaseUrl: 'postgresql://prod-db',
  emailProvider: new SendGrid(PROD_KEY)
});

const testContext = createContext({
  databaseUrl: 'postgresql://test-db',
  emailProvider: mockEmailProvider
});

const developmentContext = createContext({
  databaseUrl: 'postgresql://localhost/dev',
  emailProvider: consoleEmailProvider  // Just logs to console
});
```

Each context is isolated. Run them simultaneously without conflicts.

## Building Context Right

### The Factory Pattern

```javascript
export function createContext(config) {
  const cleanupFunctions = [];

  // Create database connection
  const pool = new Pool({ connectionString: config.databaseUrl });
  const db = drizzle(pool, { schema });

  cleanupFunctions.push(async () => {
    await pool.end();
  });

  // Create services
  const services = {};

  if (config.emailProvider) {
    services.emailProvider = config.emailProvider;
  }

  if (config.paymentProvider) {
    services.paymentProvider = config.paymentProvider;
  }

  // Return context with cleanup
  return {
    db,
    config,
    services,
    cleanupFunctions,
    async destroy() {
      for (const cleanup of this.cleanupFunctions) {
        await cleanup();
      }
    }
  };
}
```

### Why Cleanup Matters

Every resource you create must be destroyable:

```javascript
afterEach(async () => {
  await context.destroy();  // Closes DB connections, clears timers, etc.
});
```

Without proper cleanup, your tests leak memory, leave connections open, and eventually crash.

## Context vs Dependency Injection Frameworks

### What DI Frameworks Do

```javascript
@Injectable()
class UserService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(EmailService) private email: EmailService
  ) {}

  async createUser(userData) {
    // ...
  }
}
```

Looks clean, but:
- Where does `Database` come from?
- How do you provide a different one for tests?
- What magic is happening in those decorators?
- How do you debug when injection fails?

### What Context Does

```javascript
export async function createUser(context, userData) {
  // Everything is visible, nothing is magic
}
```

No decorators. No reflection. No metadata. No magic. Just a function parameter.

## Common Context Patterns

### 1. **Nested Contexts**

Sometimes you need a temporary override:

```javascript
export async function withTransaction(context, callback) {
  const tx = await context.db.transaction();
  const txContext = {
    ...context,
    db: tx  // Override just the db
  };

  try {
    const result = await callback(txContext);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

// Usage
const user = await withTransaction(context, async (txContext) => {
  return createUser(txContext, userData);
});
```

### 2. **Context Validation**

Ensure required services exist:

```javascript
export async function sendWelcomeEmail(context, user) {
  if (!context.services.emailProvider) {
    throw new Error('Email provider not configured');
  }

  return context.services.emailProvider.send({
    to: user.email,
    subject: 'Welcome!',
    html: `<h1>Welcome ${user.name}!</h1>`
  });
}
```

## The Testing Advantage

### Real Dependencies in Tests

```javascript
describe('User Creation', () => {
  let context;

  beforeEach(async () => {
    // Real database, not a mock!
    context = createTestContext();
    await cleanupDatabase(context);
  });

  afterEach(async () => {
    await context.destroy();
  });

  it('should enforce unique emails', async () => {
    await createUser(context, { email: 'test@example.com' });

    // This will hit real database constraints
    await assert.rejects(
      () => createUser(context, { email: 'test@example.com' }),
      /duplicate key/
    );
  });
});
```

This test catches real bugs that mocks would miss:
- Database constraint violations
- Transaction deadlocks
- Connection pool exhaustion
- SQL syntax errors

### Mocked External Services

```javascript
it('should send welcome email', async () => {
  const mockSend = mock.fn();
  context.services.emailProvider = { send: mockSend };

  await createUser(context, userData);

  assert.equal(mockSend.mock.calls.length, 1);
  assert.equal(mockSend.mock.calls[0].arguments[0].to, userData.email);
});
```

Mock external services, use real internal ones. Best of both worlds.

## Anti-Patterns to Avoid

:::danger
**Common Mistakes That Break Everything**
:::

### 1. **Don't Import Context**

```javascript
// BAD: Makes context global again
import { context } from './context.js';

export async function doSomething() {
  return context.db.query(/* ... */);
}

// GOOD: Accept context as parameter
export async function doSomething(context) {
  return context.db.query(/* ... */);
}
```

### 2. **Don't Mutate Context**

```javascript
// BAD: Mutating shared context
export async function addUserToContext(context, userId) {
  context.currentUser = await findUserById(context, userId);
}
```

### 3. **Don't Make Context Too Big**

```javascript
// BAD: Kitchen sink context
const context = {
  db, redis, elastic, kafka, rabbitmq,
  s3, sns, sqs, dynamodb,
  stripe, twilio, sendgrid,
  logger, metrics, tracer,
  // ... 50 more things
};

// GOOD: Only what you need
const context = {
  db,
  config,
  services: {
    emailProvider,
    paymentProvider
  }
};
```

## Summary

The context pattern gives you:
- **Explicit dependencies**: See what every function needs
- **Easy testing**: Pass different contexts for different scenarios
- **No magic**: Just a parameter, no framework complexity
- **Resource management**: Clean up everything properly
- **Flexibility**: Override parts of context as needed

It's dependency injection at its simplest: passing an object to a function. No frameworks, no decorators, no magic. Just functions and parameters, the way JavaScript was meant to be written.

Next, we'll see how this context pattern enables bulletproof server lifecycle management—servers that start cleanly, restart reliably, and shut down gracefully.