---
title: "Functional Composition"
tagline: "Small functions. Big possibilities. Zero magic."
subtitle: "Building Complex Systems from Simple Functions"
date: "2025-04-03"
category: "Patterns"
tags: ["functional", "composition", "utilities", "patterns"]
order: 10
---

:::info
**Composition Over Complexity**

Complex systems are built from simple functions. Each function does one thing well, and you compose them to create sophisticated behavior. This is the essence of functional architecture.
:::

Complex systems are built from simple functions:

```javascript
// Not this monolith
async function handleUserRegistration(request) {
  // 200 lines of tangled logic
  // Parse body, validate, check exists, hash password,
  // create user, send email, create audit log, etc.
}

// But composed functions
async function registerUser(context, registrationData) {
  const validated = validateRegistration(registrationData);
  await checkEmailAvailable(context, validated.email);
  const hashedData = await hashPassword(validated);
  const user = await createUser(context, hashedData);
  await sendWelcomeEmail(context, user);
  await createAuditLog(context, 'user.registered', user);
  return user;
}
```

Each function does one thing. Compose them to do complex things.

## Pure Utility Functions

### The Rules for Utils

:::tip
**Pure Function Guidelines**

1. **No side effects** - Same input, same output
2. **No context needed** - Pure computation
3. **Single purpose** - One function, one job
4. **Self-documenting** - Name says what it does

These rules make functions predictable, testable, and reusable across your entire application.
:::

### String Utilities

```javascript
// utils/string.ts
export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function truncate(text, length, suffix = '...') {
  if (text.length <= length) return text;
  return text.slice(0, length - suffix.length) + suffix;
}

export function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

export function camelToSnake(text) {
  return text.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

export function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }
  return false;
}
```

### Validation Utilities

```javascript
// utils/validation.ts
export function isEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isUUID(value) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

export function isStrongPassword(password) {
  return password.length >= 8 &&
    /[a-z]/.test(password) &&  // lowercase
    /[A-Z]/.test(password) &&  // uppercase
    /[0-9]/.test(password);    // number
}

export function sanitizeHtml(html) {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}
```

### Date Utilities

```javascript
// utils/date.ts
export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function formatDate(date, locale = 'en-US') {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date);
}

export function getAge(birthDate) {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}
```

## HTTP Utilities

### Request Handling

```javascript
// utils/http.ts
export async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString();
}

export async function parseJsonBody(request) {
  const body = await readBody(request);
  try {
    return JSON.parse(body);
  } catch {
    throw new ValidationError('Invalid JSON in request body');
  }
}

export function getCookie(request, name) {
  const cookies = request.headers.cookie || '';
  const pattern = new RegExp(`(?:^|; )${name}=([^;]*)`);
  const match = cookies.match(pattern);
  return match ? decodeURIComponent(match[1]) : null;
}

export function getClientIp(request) {
  return request.headers['x-forwarded-for']?.split(',')[0].trim() ||
    request.headers['x-real-ip'] ||
    request.connection.remoteAddress;
}

export function parseQueryParams(url) {
  const params = new URLSearchParams(url.searchParams);
  const result = {};

  for (const [key, value] of params) {
    if (result[key]) {
      result[key] = Array.isArray(result[key])
        ? [...result[key], value]
        : [result[key], value];
    } else {
      result[key] = value;
    }
  }

  return result;
}
```

### Response Handling

```javascript
export function sendJson(response, statusCode, data) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(data));
}

export function sendError(response, error) {
  const statusCode = error.statusCode || 500;
  const message = error.userMessage || error.message || 'Internal server error';

  sendJson(response, statusCode, {
    error: message,
    ...(error.code && { code: error.code }),
    ...(error.details && { details: error.details })
  });
}

export function setCookie(response, name, value, options = {}) {
  const opts = {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 86400,  // 1 day
    ...options
  };

  const cookie = [
    `${name}=${encodeURIComponent(value)}`,
    opts.maxAge && `Max-Age=${opts.maxAge}`,
    opts.domain && `Domain=${opts.domain}`,
    opts.path && `Path=${opts.path}`,
    opts.secure && 'Secure',
    opts.httpOnly && 'HttpOnly',
    opts.sameSite && `SameSite=${opts.sameSite}`
  ].filter(Boolean).join('; ');

  const existing = response.getHeader('Set-Cookie') || [];
  response.setHeader('Set-Cookie', Array.isArray(existing)
    ? [...existing, cookie]
    : [existing, cookie]
  );
}
```

:::warning
**Avoid Framework Lock-in**

Building your own small utility functions ensures your code isn't tied to any specific framework. These patterns work everywhere JavaScript runs.
:::

## Composition Patterns

### Retry Pattern

```javascript
export async function retry(func, options = {}) {
  const {
    attempts = 3,
    delay = 1000,
    backoff = 2,
    shouldRetry = () => true
  } = options;

  let lastError;

  for (let i = 0; i < attempts; i++) {
    try {
      return await func();
    } catch (error) {
      lastError = error;

      if (i === attempts - 1 || !shouldRetry(error)) {
        throw error;
      }

      const waitTime = delay * Math.pow(backoff, i);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw lastError;
}

// Usage
const result = await retry(
  () => fetchDataFromFlakeyAPI(),
  {
    attempts: 3,
    delay: 1000,
    shouldRetry: (error) => error.code === 'ETIMEDOUT'
  }
);
```

### Batch Pattern

```javascript
export function batchProcessor(processor, options = {}) {
  const { batchSize = 100, delay = 0 } = options;
  const queue = [];
  let timer = null;

  async function flush() {
    if (queue.length === 0) return;

    const batch = queue.splice(0, batchSize);
    await processor(batch);

    if (queue.length > 0) {
      timer = setTimeout(flush, delay);
    }
  }

  return {
    add(item) {
      queue.push(item);

      if (queue.length >= batchSize) {
        flush();
      } else if (!timer) {
        timer = setTimeout(flush, delay);
      }
    },

    async flush() {
      clearTimeout(timer);
      timer = null;
      await flush();
    }
  };
}

// Usage
const emailBatcher = batchProcessor(
  async (emails) => {
    await sendBulkEmails(emails);
  },
  { batchSize: 50, delay: 1000 }
);

// Add emails to batch
emailBatcher.add({ to: 'user1@example.com', subject: 'Hello' });
emailBatcher.add({ to: 'user2@example.com', subject: 'Hello' });
```

## Service Patterns

These sit on a very fine line between “a small utility” and “a dependency you should probably use instead of rolling your own.” Use single‑responsibility, well‑understood building blocks.

Guidelines:
- Prefer built‑ins first. If Node provides a primitive (events, timers, Maps), use it.
- If a library is needed, choose a single‑responsibility, side‑effect‑free library that is easy to replace later (no framework tie‑ins).
- Only build your own when the use case is genuinely simple and contained, or when you need behavior you can’t get from a small, focused library.
- Small helpers (e.g., `removeDuplicates`) live in `utils/`. Bigger “services” (caching, rate limiting, event bus) should consider their own package in the monorepo so they can be extracted cleanly later. Do not create a giant catch‑all `@CompanyLtdUtilLibrary`.

### Cache Pattern

```javascript
export function createCache(options = {}) {
  const { ttl = 60000, maxSize = 100 } = options;
  const cache = new Map();

  return {
    get(key) {
      const item = cache.get(key);
      if (!item) return undefined;

      if (Date.now() > item.expiry) {
        cache.delete(key);
        return undefined;
      }

      return item.value;
    },

    set(key, value) {
      if (cache.size >= maxSize && !cache.has(key)) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }

      cache.set(key, {
        value,
        expiry: Date.now() + ttl
      });
    },

    delete(key) {
      cache.delete(key);
    },

    clear() {
      cache.clear();
    },

    async getOrSet(key, factory) {
      let value = this.get(key);

      if (value === undefined) {
        value = await factory();
        this.set(key, value);
      }

      return value;
    }
  };
}

// Usage
const userCache = createCache({ ttl: 300000 });  // 5 minutes

async function getCachedUser(context, userId) {
  return userCache.getOrSet(
    `user:${userId}`,
    () => findUserById(context, userId)
  );
}
```

### Rate Limiter Pattern

Use a tiny, in‑memory limiter only for simple, local use cases (e.g., per‑process throttling in tests or CLI tools). For production, prefer a single‑purpose library or a backing store (e.g., Redis) implementation that is safe across processes and instances.

```javascript
export function createRateLimiter(options = {}) {
  const { windowMs = 60000, maxRequests = 100 } = options;
  const requests = new Map();

  return {
    async checkLimit(identifier) {
      const now = Date.now();
      const userRequests = requests.get(identifier) || [];

      // Remove old requests outside window
      const validRequests = userRequests.filter(
        time => now - time < windowMs
      );

      if (validRequests.length >= maxRequests) {
        const oldestRequest = validRequests[0];
        const resetTime = oldestRequest + windowMs;
        const retryAfter = Math.ceil((resetTime - now) / 1000);

        throw new AppError(
          'Rate limit exceeded',
          429,
          'RATE_LIMIT_EXCEEDED',
          { retryAfter }
        );
      }

      validRequests.push(now);
      requests.set(identifier, validRequests);

      return {
        remaining: maxRequests - validRequests.length,
        resetAt: new Date(now + windowMs)
      };
    },

    reset(identifier) {
      requests.delete(identifier);
    }
  };
}

// Usage in controller
const rateLimiter = createRateLimiter({
  windowMs: 60000,  // 1 minute
  maxRequests: 10
});

export async function rateLimitedController(context, request, response) {
  const clientIp = getClientIp(request);
  await rateLimiter.checkLimit(clientIp);

  // Process request
}
```

### Event Emitter Pattern

Prefer Node’s built‑in `events` module for simple pub/sub. If you want a small, typed, promise‑friendly API, consider a focused library like `emittery`. Avoid building your own emitter unless the requirements are extremely minimal.

Using Node’s EventEmitter:

```javascript
import { EventEmitter } from 'node:events';

export const userEvents = new EventEmitter();

// Usage
userEvents.on('user.created', async (user) => {
  await sendWelcomeEmail(context, user);
});

userEvents.on('user.created', async (user) => {
  await createAuditLog(context, 'user.created', user);
});

// In model
const user = await createUser(context, userData);
userEvents.emit('user.created', user);
```

Using a single‑responsibility library (e.g., emittery):

```javascript
import Emittery from 'emittery';

export const userEvents = new Emittery();

userEvents.on('user.created', async (user) => {
  await sendWelcomeEmail(context, user);
});

// Async emit with backpressure awareness
await userEvents.emit('user.created', user);
```

Packaging guidance: if eventing starts to grow (channels, middleware, retries), extract it to its own monorepo package rather than expanding `utils/`.

## Testing Utilities

### Test Data Builders

```javascript
// tests/builders.ts
export function buildUser(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    email: `test-${Date.now()}@example.com`,
    name: 'Test User',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

export function buildPost(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    title: 'Test Post',
    content: 'Test content',
    authorId: crypto.randomUUID(),
    published: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

// Usage in tests
it('should update user', async () => {
  const user = buildUser({ name: 'Original Name' });
  await insertUser(context, user);

  const updated = await updateUser(context, user.id, {
    name: 'New Name'
  });

  assert.equal(updated.name, 'New Name');
});
```

### Test Helpers

```javascript
// tests/helpers.ts
export async function withTestUser(context, callback) {
  const user = await createUser(context, buildUser());

  try {
    return await callback(user);
  } finally {
    await deleteUser(context, user.id);
  }
}

export async function withAuthentication(request, user) {
  const token = await generateToken(user);
  request.headers.authorization = `Bearer ${token}`;
  return request;
}

export function assertErrorResponse(response, expectedStatus, expectedMessage) {
  assert.equal(response.status, expectedStatus);
  assert.ok(response.body.error);

  if (expectedMessage) {
    assert.ok(response.body.error.includes(expectedMessage));
  }
}

// Usage
it('should require authentication', async () => {
  const response = await fetch(`${server.url}/api/protected`);
  const body = await response.json();
  assertErrorResponse({ status: response.status, body }, 401, 'Authentication required');
});
```

## Performance Patterns

### Memoization

```javascript
export function memoize(func, options = {}) {
  const { maxSize = 100, ttl = Infinity } = options;
  const cache = new Map();

  return function(...args) {
    const key = JSON.stringify(args);
    const cached = cache.get(key);

    if (cached && Date.now() < cached.expiry) {
      return cached.value;
    }

    const result = func.apply(this, args);

    if (cache.size >= maxSize && !cache.has(key)) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }

    cache.set(key, {
      value: result,
      expiry: Date.now() + ttl
    });

    return result;
  };
}

// Usage
const expensiveCalculation = memoize(
  (n) => {
    console.log('Calculating...');
    return fibonacci(n);
  },
  { maxSize: 50, ttl: 60000 }
);
```

### Debounce and Throttle

```javascript
export function debounce(func, delay) {
  let timeoutId;

  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

export function throttle(func, limit) {
  let inThrottle;

  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Usage
const debouncedSearch = debounce(
  (query) => searchUsers(context, query),
  300
);

const throttledScroll = throttle(
  () => loadMoreContent(),
  1000
);
```

:::success
**Functional Mastery**

When you master these patterns, you can build any application without complex frameworks or dependencies. Simple functions composed together create powerful, maintainable systems.
:::

## Summary

These patterns demonstrate:

1. **Small functions compose into complex behavior**
2. **Pure functions are predictable and testable**
3. **Utilities should be focused and reusable**
4. **Patterns can be implemented without frameworks**
5. **Simple code is maintainable code**

The key is to build a library of small, focused, well-tested utilities that you understand completely. When you need something complex, compose simple functions together rather than reaching for a complex dependency. If a pattern grows beyond a trivial helper, extract it into its own monorepo package rather than expanding `utils/`.

This is functional programming at its best: small functions that do one thing well, composed together to build powerful applications.
