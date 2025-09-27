---
title: "Testing Philosophy: Mock the World, Not Your App"
tagline: "Mock Twilio. Use real Postgres."
subtitle: "Why Mocking Your Database Makes Your Tests Worthless"
date: "2025-04-03"
category: "Testing"
tags: ["testing", "mocking", "integration-tests", "philosophy"]
order: 8
---

## The Great Testing Lie

:::danger
**The Mock Trap**

Unit tests with mocks everywhere don't test your actual code, they test that your mocks work. When your real database enforces constraints your mock ignores, guess which one your users encounter?
:::

You've seen this pattern a thousand times:

```javascript
// "Unit test" that mocks everything
it('should create user', async () => {
  const mockDb = {
    insert: jest.fn().mockResolvedValue({ id: 1, email: 'test@example.com' })
  };

  const mockEmailService = {
    send: jest.fn().mockResolvedValue({ success: true })
  };

  const result = await createUser(mockDb, mockEmailService, userData);

  expect(mockDb.insert).toHaveBeenCalledWith(userData);
  expect(mockEmailService.send).toHaveBeenCalled();
  expect(result.id).toBe(1);
});
```

Congratulations! You've tested that your mocks work. But does your actual code work? Who knows!

## The Reality Check

### What That Test Actually Tests

1. Your mock returns data in the shape you expect
2. Your function calls methods with names you expect
3. Your test passes when your mocks behave perfectly

### What That Test Doesn't Test

1. Your SQL syntax is correct
2. Database constraints are enforced
3. Transactions actually roll back
4. Connection pooling works
5. Your actual code works with an actual database

## The Testing Pyramid Is Upside Down

Traditional wisdom says:
- Many unit tests (fast, isolated)
- Some integration tests (slower, realistic)
- Few E2E tests (slowest, most realistic)

This is backwards. Here's why:

### The Mock Problem

```javascript
// Your mock
const mockDb = {
  users: {
    create: async (data) => ({ id: 1, ...data })
  }
};

// Real database
await db.users.create({
  email: 'test@example.com',
  age: -5  // Mock: Sure! Real DB: CHECK constraint violation
});
```

Your mock happily accepts invalid data. Your real database doesn't. Guess which one your users interact with?

## The Right Way: Test With Real Dependencies

### Use Real Databases

```javascript
describe('User Creation', () => {
  let context;

  beforeEach(async () => {
    // Real PostgreSQL database
    context = createTestContext({
      databaseUrl: 'postgresql://localhost/test'
    });

    // Clean state for each test
    await cleanupDatabase(context);
  });

  it('should enforce unique emails', async () => {
    // This test catches REAL database constraint violations
    await createUser(context, { email: 'test@example.com' });

    await assert.rejects(
      () => createUser(context, { email: 'test@example.com' }),
      /duplicate key value violates unique constraint/
    );
  });

  it('should rollback on error', async () => {
    await assert.rejects(
      () => withTransaction(context, async (tx) => {
        await createUser(tx, userData);
        throw new Error('Oops');
      })
    );

    // Verify ACTUAL rollback happened
    const users = await context.db.query.users.findMany();
    assert.equal(users.length, 0);
  });
});
```

These tests catch real bugs:
- Incorrect SQL syntax
- Constraint violations
- Deadlocks
- Connection issues
- Transaction problems

### But Mock External Services

```javascript
describe('User Registration', () => {
  let context;

  beforeEach(async () => {
    context = createTestContext();

    // Mock EXTERNAL service (Twilio, SendGrid, Stripe, etc.)
    context.services.emailProvider = {
      send: mock.fn().mockResolvedValue({ messageId: 'fake-id' })
    };
  });

  it('should send welcome email', async () => {
    const user = await registerUser(context, userData);

    // Verify the mock was called correctly
    assert.equal(
      context.services.emailProvider.send.mock.calls.length,
      1
    );

    const [call] = context.services.emailProvider.send.mock.calls;
    assert.equal(call.arguments[0].to, userData.email);
    assert.ok(call.arguments[0].subject.includes('Welcome'));
  });
});
```

## The Simple Rule

:::success
**Mock what you don't own. Use real versions of what you do own.**

This simple rule eliminates 90% of testing confusion and leads to tests that actually catch bugs.
:::

### What You Own (Use Real Versions)
- Your database
- Your Redis cache
- Your file system
- Your internal services
- Your message queues

### What You Don't Own (Mock These)
- Twilio (SMS)
- SendGrid (Email)
- Stripe (Payments)
- AWS S3 (Storage)
- External APIs
- Third-party services

## Why This Works

### 1. **Real Bugs Get Caught**

```javascript
// This mock-heavy test passes
it('should update user', async () => {
  mockDb.update.mockResolvedValue({ id: 1, name: 'Updated' });
  const result = await updateUser(mockDb, 1, { name: 'Updated' });
  expect(result.name).toBe('Updated');
});

// But the real code fails!
await db.update(users)
  .set({ name: 'Updated' })
  .where(eq(users.id, userId))
  .returning();  // Oops! PostgreSQL needs RETURNING *
```

### 2. **Tests Are Documentation**

```javascript
it('should handle concurrent updates', async () => {
  const user = await createUser(context, userData);

  // Real database handles real concurrency
  const updates = Promise.all([
    updateUserCredits(context, user.id, 10),
    updateUserCredits(context, user.id, 20),
    updateUserCredits(context, user.id, 30)
  ]);

  await updates;

  const finalUser = await findUserById(context, user.id);
  assert.equal(finalUser.credits, 60);  // All updates applied
});
```

This test documents that your code handles concurrency correctly. A mock can't prove this.

### 3. **Refactoring Is Safe**

```javascript
// Change from callbacks to async/await
// Change from one query to two
// Change from ORM to raw SQL
// Add caching
// Add pagination

// Tests still pass = refactoring worked
```

When you test with real dependencies, you can refactor implementation details without touching tests.

## Testing Patterns

### The Test Context Pattern

```javascript
export function createTestContext(overrides = {}) {
  const config = {
    databaseUrl: process.env.TEST_DATABASE_URL ||
                 'postgresql://localhost/test',
    port: 0,  // Random port for tests
    ...overrides
  };

  const context = createContext(config);

  // Add test helpers
  context.test = {
    async cleanDatabase() {
      await context.db.delete(schema.posts);
      await context.db.delete(schema.users);
    },

    async createTestUser(data = {}) {
      return createUser(context, {
        email: `test-${Date.now()}@example.com`,
        name: 'Test User',
        ...data
      });
    }
  };

  return context;
}
```

### The Fixture Pattern

```javascript
export async function setupFixtures(context) {
  const admin = await createUser(context, {
    email: 'admin@example.com',
    role: 'admin'
  });

  const users = await Promise.all([
    createUser(context, { email: 'user1@example.com' }),
    createUser(context, { email: 'user2@example.com' })
  ]);

  const posts = await Promise.all(
    users.map(user =>
      createPost(context, {
        authorId: user.id,
        title: `Post by ${user.name}`
      })
    )
  );

  return { admin, users, posts };
}

// Usage
it('should list posts', async () => {
  const { posts } = await setupFixtures(context);
  const result = await listPosts(context);
  assert.equal(result.length, posts.length);
});
```

### The Mock Service Pattern

```javascript
// Create mock services that behave like real ones
export function createMockEmailProvider() {
  const sent = [];

  return {
    sent,  // Expose for assertions

    async send(options) {
      // Simulate real service behavior
      if (!options.to || !options.to.includes('@')) {
        throw new Error('Invalid email address');
      }

      const message = {
        id: `msg_${Date.now()}`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        sentAt: new Date()
      };

      sent.push(message);
      return { messageId: message.id };
    },

    reset() {
      sent.length = 0;
    }
  };
}

// Usage
it('should send email', async () => {
  const emailProvider = createMockEmailProvider();
  context.services.emailProvider = emailProvider;

  await sendWelcomeEmail(context, user);

  assert.equal(emailProvider.sent.length, 1);
  assert.equal(emailProvider.sent[0].to, user.email);
});
```

:::tip
**Speed Reality Check**

Real PostgreSQL tests: 8ms per test
Mocked tests: 2ms per test

Difference: 6ms
Time saved debugging real issues: Hours
:::

## Speed Concerns

"But real databases are slow!"

### Reality Check

```bash
# Test with mocks
✓ should create user (2ms)
✓ should update user (1ms)
✓ should delete user (1ms)

# Test with real PostgreSQL
✓ should create user (8ms)
✓ should update user (6ms)
✓ should delete user (5ms)
```

Your tests take 6ms longer. Your debugging time drops by hours.

### Speed Optimization

```javascript
// 1. Run tests in transactions that rollback
export async function withTestTransaction(context, callback) {
  const tx = await context.db.transaction();

  try {
    const txContext = { ...context, db: tx };
    await callback(txContext);
  } finally {
    await tx.rollback();  // Always rollback, even on success
  }
}

// 2. Use connection pooling
const pool = new Pool({
  max: 20,  // More connections for parallel tests
  idleTimeoutMillis: 0  // Keep connections open
});

// 3. Run database in memory (for CI)
docker run -d --tmpfs /var/lib/postgresql/data postgres:15
```

## Integration Testing Patterns

### Test the Full Stack

```javascript
describe('User API', () => {
  let context;
  let server;

  beforeEach(async () => {
    context = createTestContext();
    server = createServer(context);
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('should create and retrieve user', async () => {
    // Create via API
    const createResponse = await fetch(
      `http://localhost:${server.port}/users`,
      {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' })
      }
    );

    const user = await createResponse.json();

    // Retrieve via API
    const getResponse = await fetch(
      `http://localhost:${server.port}/users/${user.id}`
    );

    const retrieved = await getResponse.json();

    assert.deepEqual(retrieved, user);
  });
});
```

This tests:
- HTTP parsing
- Routing
- Validation
- Database operations
- Response formatting
- The entire request/response cycle

### Test Error Conditions

```javascript
it('should handle database outages', async () => {
  // Simulate database failure
  await context.db.$client.end();

  const response = await fetch(
    `http://localhost:${server.port}/users/123`
  );

  assert.equal(response.status, 500);

  const error = await response.json();
  assert.ok(error.error.includes('database'));
});
```

## The Testing Mindset

### Don't Test Implementation

```javascript
// BAD: Testing implementation details
it('should call database.insert', async () => {
  await createUser(context, userData);
  expect(mockDb.insert).toHaveBeenCalledTimes(1);
});

// GOOD: Testing behavior
it('should persist user data', async () => {
  const user = await createUser(context, userData);

  const found = await findUserById(context, user.id);
  assert.equal(found.email, userData.email);
});
```

### Test Behavior, Not Structure

```javascript
// BAD: Brittle test tied to structure
it('should have email property', () => {
  const user = { id: 1, email: 'test@example.com' };
  expect(user).toHaveProperty('email');
});

// GOOD: Testing actual behavior
it('should send email to user address', async () => {
  const user = await createUser(context, {
    email: 'test@example.com'
  });

  await sendPasswordReset(context, user.id);

  const sent = context.services.emailProvider.sent;
  assert.equal(sent[0].to, 'test@example.com');
});
```

## Common Objections

### "My tests need to run offline!"

Your CI/CD pipeline has internet. Your development machine has Docker. Run PostgreSQL locally:

```bash
docker run -d -p 5432:5432 -e POSTGRES_DB=test postgres:15
```

### "Mocks are more predictable!"

Predictably wrong. Real dependencies are predictably real.

### "But Martin Fowler says..."

Martin Fowler also says: "Most mockists I know don't use mocks for all dependencies, only for certain types." Mock external services, use real internal ones.

### "It's not a unit test if..."

Who cares what it's called? Does it catch bugs? Does it give confidence? Does it document behavior? That's what matters.

:::success
**Testing That Works**

When your tests use real dependencies, they catch real bugs. When they catch real bugs, you ship reliable software. When you ship reliable software, you sleep better at night.
:::

## Summary

The testing philosophy is simple:

1. **Use real versions of things you own** (database, cache, file system)
2. **Mock things you don't own** (external APIs, third-party services)
3. **Test behavior, not implementation**
4. **Let tests document your system**
5. **Optimize for debugging time, not test execution time**

When your tests use real dependencies, they catch real bugs. When they catch real bugs, you ship reliable software. When you ship reliable software, you sleep better at night.
