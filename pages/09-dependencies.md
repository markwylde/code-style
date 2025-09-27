---
title: "Dependencies: The Art of Saying No"
tagline: "Every npm install is future debt."
subtitle: "Why Every npm Package Is a Liability, Not an Asset"
date: "2025-04-03"
category: "Architecture"
tags: ["dependencies", "minimalism", "maintenance", "npm"]
order: 9
---

:::warning
**The Hidden Cost**

Every package you add is code you didn't write but must maintain. When it breaks, you fix it. When it's deprecated, you migrate. When it has a vulnerability, you scramble.
:::

```bash
npm install express body-parser cors helmet morgan cookie-parser
npm install express-session passport passport-local express-validator
npm install multer serve-favicon compression express-rate-limit

# Congratulations! You now maintain:
# - 487 transitive dependencies
# - 62MB of node_modules
# - 14 different versioning conflicts
# - ∞ security vulnerabilities
```

Every package you add is code you didn't write but must maintain. When it breaks, you fix it. When it's deprecated, you migrate. When it has a vulnerability, you scramble.

## The Dependency Pyramid of Pain

### Level 1: The Package
"Oh, I'll just add Express. It's just one package!"

### Level 2: The Ecosystem
Express needs body-parser, cookie-parser, express-session, express-validator...

### Level 3: The Transitive Hell
body-parser needs raw-body, which needs bytes, which needs...

### Level 4: The Version Conflicts
```
npm ERR! peer dep missing: express@^4.0.0, required by express-session@1.17.0
npm ERR! peer dep missing: express@^3.0.0, required by some-old-middleware@0.1.0
```

### Level 5: The Security Nightmare
```
found 47 vulnerabilities (4 low, 31 moderate, 12 high)
run `npm audit fix` to fix them, or `npm audit` for details
```

:::info
**Modern JavaScript Reality**

Today's JavaScript has built-in solutions for 80% of what you used to need libraries for. Before reaching for a package, check if the standard library already does what you need.
:::

## You Don't Need That Package

### You Don't Need Lodash

```javascript
// You think you need lodash
import _ from 'lodash';
const unique = _.uniq(array);
const chunked = _.chunk(array, 2);
const flattened = _.flatten(nested);

// You don't
const unique = [...new Set(array)];
const chunked = array.reduce((acc, val, i) =>
  i % 2 ? acc : [...acc, array.slice(i, i + 2)], []);
const flattened = nested.flat();
```

Modern JavaScript has almost everything Lodash offers:
- Array methods: map, filter, reduce, find, some, every
- Object methods: Object.keys, Object.values, Object.entries
- Spread operator: {...obj}, [...array]
- Optional chaining: obj?.nested?.property
- Nullish coalescing: value ?? defaultValue

### You Don't Need Axios

```javascript
// You think you need axios
import axios from 'axios';
const { data } = await axios.get('/api/users');

// You don't - fetch is built-in
const response = await fetch('/api/users');
const data = await response.json();

// "But axios has interceptors!"
const apiFetch = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
};
```

### You Don't Need Moment.js

```javascript
// You think you need moment
import moment from 'moment';  // 67KB minified!
const formatted = moment().format('YYYY-MM-DD');

// You don't
const formatted = new Date().toISOString().split('T')[0];

// Need more? Use the built-in Intl
const formatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});
formatted = formatter.format(new Date());  // "December 25, 2024"
```

### You Don't Need Express

```javascript
// You think you need Express
const express = require('express');
const app = express();
app.use(bodyParser.json());
app.get('/users/:id', (request, response) => {
  response.json({ id: request.params.id });
});

// You don't - Node has everything
import { createServer } from 'http';
import { z } from 'zod';

const routes = [
  {
    method: 'GET',
    pattern: '/users/:id',
    schema: {
      path: z.object({ id: z.string() })
    },
    handler: ({ path, response }) => {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ id: path.id }));
    }
  }
];

function matchRoute(pathname, routePattern) {
  const pathSegments = pathname.split('/').filter(Boolean);
  const patternSegments = routePattern.split('/').filter(Boolean);

  if (pathSegments.length !== patternSegments.length) return null;

  const params = {};
  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index];
    const pathSegment = pathSegments[index];

    if (patternSegment.startsWith(':')) {
      params[patternSegment.slice(1)] = pathSegment;
    } else if (patternSegment !== pathSegment) {
      return null;
    }
  }

  return params;
}

createServer((request, response) => {
  const { pathname = '/' } = new URL(request.url, `http://${request.headers.host}`);

  for (const route of routes) {
    if (request.method !== route.method) continue;

    const pathParams = matchRoute(pathname, route.pattern);
    if (!pathParams) continue;

    const parsed = route.schema?.path
      ? route.schema.path.safeParse(pathParams)
      : { success: true, data: {} };

    if (!parsed.success) {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Invalid path parameters', issues: parsed.error.issues }));
      return;
    }

    return route.handler({ path: parsed.data, response });
  }

  response.writeHead(404, { 'Content-Type': 'text/plain' });
  response.end('Not found');
}).listen(3000);
```

## The Middleware Trap

### The Promise

"Middleware makes everything pluggable and reusable!"

### The Reality

```javascript
app.use(bodyParser.json());
app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('combined'));
app.use(compression({ threshold: 0 }));
app.use(session({ secret: 'keyboard cat' }));
app.use(passport.initialize());
app.use(passport.session());

// Now debug why request.body is sometimes undefined
// Hint: middleware order matters, but good luck figuring out which
```

### The Problem

Middleware is mutation in disguise:

```javascript
// What does this middleware do?
app.use(someMiddleware());

// It mutates request and response in unknown ways:
// - Adds request.body (maybe)
// - Adds rerequestq.session (possibly)
// - Modifies response.send (probably)
// - Adds request.user (who knows)
```

### The Solution

Replace middleware with functions:

```javascript
// Instead of middleware magic
app.use(bodyParser.json());
app.post('/users', (request, response) => {
  console.log(request.body);  // Where did this come from?
});

// Use explicit functions
app.post('/users', async (request, response) => {
  const body = await parseJsonBody(request);  // Explicit!
  console.log(body);
});

async function parseJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
```

## The Vertical Dependency Stack Problem

### Framework Lock-In

```javascript
// You start with Express
express → express-session → connect-redis → redis

// Want to switch to Fastify?
fastify → @fastify/session → @fastify/redis → ioredis

// Everything breaks. Start over.
```

### Version Coupling

```
express@4.17.1 requires body-parser@^1.19.0
body-parser@1.19.0 requires raw-body@2.4.0
raw-body@2.4.0 requires bytes@3.1.0

// One security update cascades through everything
bytes has vulnerability → update raw-body → update body-parser → update express → update everything that depends on express
```

### The Alternative

Use focused, single-purpose libraries:

```javascript
// Instead of the Express ecosystem
import { createServer } from 'http';  // Built-in
import { parse } from 'cookie';        // Just cookies, 2KB
import jwt from 'jose';                // Just JWT, no passport needed

// Your server doesn't care about frameworks
const server = createServer(handleRequest);

// Your business logic doesn't care about HTTP
const user = await createUser(context, userData);
```

## When You DO Need Dependencies

### The Criteria

:::tip
**The Five-Question Test**

Before adding any dependency, ask these five questions. If you can't answer "yes" to most of them, you probably don't need it.
:::

Ask these questions before adding a dependency:

1. **Is it solving a complex problem?**
   - ✅ Database driver (complex protocol)
   - ❌ Left-pad (trivial string manipulation)

2. **Would implementing it yourself be over the top?**
   - ✅ React (entire UI library)
   - ❌ is-odd (literally `n % 2 === 1`)

3. **Is it actively maintained?**
   - ✅ Last commit this month
   - ❌ Last commit in 2019

4. **Is it focused on one thing?**
   - ✅ `jose` - Just JWT
   - ❌ `passport` - Authentication framework ecosystem

5. **Can you vendor it if needed?**
   - ✅ Single file you can copy
   - ❌ Complex build system with native bindings

### Good Dependencies

These solve hard problems well:

```javascript
// Database drivers - Complex protocols
import { Pool } from 'pg';
import { createClient } from 'redis';

// Parsing/validation - Better than writing parsers
import { z } from 'zod';

// Cryptography - NEVER roll your own
import { jose } from 'jose';
import bcrypt from 'bcrypt';

// Complex UI - Massive problem space
import React from 'react';
import { render } from 'solid-js/web';

// Build tools - Complex bundling
import vite from 'vite';
import esbuild from 'esbuild';
```

### Bad Dependencies

These you can write yourself:

```javascript
// Trivial utilities
import isEmail from 'is-email';  // Just a regex
import leftPad from 'left-pad';  // One line of code
import isOdd from 'is-odd';      // Seriously?

// Simple wrappers
import axios from 'axios';        // Wraps fetch
import request from 'request';    // Deprecated wrapper

// Framework-specific middleware
import bodyParser from 'body-parser';     // Ties you to Express
import expressValidator from 'express-validator';  // Framework lock-in
```

## Building Your Own Utilities

### The Copy-Paste Pattern

Instead of installing a package, copy the code:

```javascript
// Instead of: npm install slugify
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Instead of: npm install debounce
export function debounce(func, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Instead of: npm install deep-equal
export function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
}
```

50 lines of code you control vs 50KB of dependencies you don't.

## Evaluating Framework Alternatives

### Before Choosing a Framework

Ask yourself:
- What specific problem does it solve?
- Can I solve it with Node.js built-ins?
- What happens when the framework dies?
- How hard is it to migrate away?

### The Escape Hatch Test

Before adopting a framework, try to escape:

```javascript
// Can you use your business logic outside the framework?
const user = await createUser(context, userData);  // ✅ Works anywhere

// Or is it coupled to the framework?
@Controller()
class UserController {
  @Post()
  @UseGuards(AuthGuard)
  @UsePipes(ValidationPipe)
  async create(@Body() dto: CreateUserDto) {  // ❌ NestJS forever
    // ...
  }
}
```

If you can't use your code without the framework, you're locked in.

## The Maintenance Reality

### The True Cost

Every dependency has ongoing costs:
- **Security updates**: Constant CVE patches
- **Breaking changes**: Major version migrations
- **Deprecations**: Packages get abandoned
- **Conflicts**: Dependencies fight each other
- **Bloat**: Each package brings friends
- **Debugging**: More code to understand

### The Calculation

```javascript
// One-time cost: Write 50 lines of code
function parseJsonBody(request) {
  // Your implementation
}
// Ongoing cost: Zero

// vs

// One-time cost: npm install body-parser
// Ongoing cost:
// - Security updates every month
// - Breaking changes every year
// - Debugging middleware issues
// - Version conflicts with Express
// - 53 transitive dependencies
```

## The Payoff

### What You Get

When you minimize dependencies:

1. **Faster installs**: Seconds, not minutes
2. **Smaller deploys**: Megabytes, not gigabytes
3. **Fewer vulnerabilities**: Less surface area
4. **Easier debugging**: Less code to understand
5. **Better performance**: Less abstraction overhead
6. **Future proof**: Your code outlives frameworks

### The Freedom

```bash
# Your entire production dependencies
{
  "dependencies": {
    "pg": "^8.11.0",       # Database driver (necessary)
    "redis": "^4.6.0",     # Cache driver (necessary)
    "zod": "^3.22.0",      # Validation (complex enough)
    "jose": "^5.1.0"       # JWT (never roll crypto)
  }
}

# That's it. Four dependencies. Total.
```

:::success
**Dependency Freedom**

The best dependency is no dependency. The second best is one you can understand, vendor, or replace. Everything else is technical debt you're adding to your project.
:::

## Summary

The dependency philosophy:

1. **Default to No**: Every package needs justification
2. **Use built-ins**: Node.js has more than you think
3. **Write simple utilities**: 50 lines > 50 dependencies
4. **Avoid frameworks**: They're prisons with nice wallpaper
5. **Question everything**: "Industry standard" means nothing

Remember: The best dependency is no dependency. The second best is one you can understand, vendor, or replace. Everything else is technical debt you're adding to your project.

Next, we'll explore practical patterns—how to build complex functionality from simple, composable functions.
