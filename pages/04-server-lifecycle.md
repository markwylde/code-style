---
title: "Server Lifecycle"
tagline: "Start clean. Stop gracefully. Never leak."
subtitle: "Building Bulletproof Servers"
author: "Claude"
date: "2024-12-25"
category: "Infrastructure"
tags: ["server", "lifecycle", "production", "testing"]
order: 4
---

## The Typical Node.js Server Mess

:::danger
**The "Ship It and Hope" Approach**
:::

How most Node.js servers are built:

```javascript
// server.js
const app = express();
app.use(/* middlewares */);
app.listen(3000, () => console.log('Server started'));

// That's it. Ship it! 🚢
```

What happens when:
- You need to restart without dropping connections?
- Tests leave servers running on random ports?
- Database connections aren't closed properly?
- Background jobs keep running with stale data?
- You need to deploy without downtime?

The answer: **Pain**. Lots of pain.

## The Lifecycle Contract

A proper server has four fundamental operations:

```javascript
const server = createServer(context);
await server.start();   // Starts and waits until ready
await server.stop();    // Stops and cleans up everything
await server.restart(); // Stops old, starts new on same port
```

Each operation has guarantees:
- **start()**: Resolves only when the server is ready to accept requests
- **stop()**: Resolves only when all resources are released
- **restart()**: Atomic operation - old server stops, new server starts

## Why Lifecycle Matters

:::warning
**Ignoring Lifecycle = Production Nightmares**

Every server without proper lifecycle management is a ticking time bomb. Memory leaks, hanging connections, and zombie processes are not edge cases—they're guaranteed outcomes.
:::

### 1. **Memory Leaks Are Real**

Without proper cleanup:

```javascript
// This leaks everything
let server;

beforeEach(() => {
  server = app.listen(0);  // New server each test
});

// No cleanup = leaked servers, sockets, timers, database connections
```

After 100 tests, you have 100 servers running. Your CI pipeline crashes. Your laptop fans sound like a jet engine.

### 2. **Graceful Shutdowns Save Data**

```javascript
// BAD: Kills everything immediately
process.on('SIGTERM', () => {
  process.exit(0);  // In-flight requests? Database writes? Too bad!
});

// GOOD: Graceful shutdown
process.on('SIGTERM', async () => {
  await server.stop();  // Finishes requests, closes connections
  process.exit(0);
});
```

### 3. **Zero-Downtime Deployments**

```javascript
// Hot reload in production
process.on('SIGUSR2', async () => {
  await server.restart();  // Old connections drain, new ones accept
});
```

No dropped connections. No lost requests. No angry users.

## The Architecture

### Creating a Lifecycle-Aware Server

```javascript
export function createServer(context) {
  let httpServer = null;
  let connections = new Set();
  let isShuttingDown = false;

  return {
    async start() {
      if (httpServer) {
        throw new Error('Server already started');
      }

      httpServer = createHttpServer((request, response) => {
        // Your request handler
      });

      // Track connections for graceful shutdown
      httpServer.on('connection', (socket) => {
        connections.add(socket);
        socket.on('close', () => {
          connections.delete(socket);
        });
      });

      // Start listening
      await new Promise((resolve, reject) => {
        httpServer.listen(context.config.port, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Wait for readiness
      await this.waitForReady();
    },

    async stop() {
      if (!httpServer) return;

      isShuttingDown = true;

      // Stop accepting new connections
      await new Promise((resolve) => {
        httpServer.close(resolve);
      });

      // Close existing connections gracefully
      for (const socket of connections) {
        socket.end();
      }

      // Force close after timeout
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          for (const socket of connections) {
            socket.destroy();
          }
          resolve();
        }, 5000);

        if (connections.size === 0) {
          clearTimeout(timeout);
          resolve();
        }
      });

      // Clean up context resources
      await context.destroy();

      httpServer = null;
      isShuttingDown = false;
    },

    async restart() {
      const port = context.config.port;
      await this.stop();

      // Create fresh context - NEVER reuse old one
      const newContext = createContext(context.config);
      context = newContext;

      await this.start();
    },

    async waitForReady() {
      // Poll health endpoint until ready
      const maxAttempts = 30;
      for (let i = 0; i < maxAttempts; i++) {
        try {
          const response = await fetch(
            `http://localhost:${context.config.port}/health`
          );
          if (response.ok) return;
        } catch (e) {
          // Not ready yet
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Server failed to become ready');
    }
  };
}
```

## The Context Generation Problem

### Why Fresh Context on Restart?

```javascript
// BAD: Reusing context after restart
let context = createContext(config);
const server = createServer(context);

await server.restart();  // Still using old context!
// Old database connections, stale caches, outdated config
```

## Port Management

### Development vs Production

```javascript
export function createContext(config) {
  return {
    config: {
      port: config.port || (
        process.env.NODE_ENV === 'test' ? 0 :  // Random port for tests
        process.env.PORT || 3000                // Fixed port otherwise
      ),
      // ...
    }
  };
}
```

Tests get random ports (port 0), preventing conflicts. Production gets stable ports.

### Multiple Servers

```javascript
export function createServers(context) {
  const servers = {
    api: createApiServer(context, context.config.apiPort),
    admin: createAdminServer(context, context.config.adminPort),
    metrics: createMetricsServer(context, context.config.metricsPort)
  };

  return {
    async start() {
      await Promise.all(
        Object.values(servers).map(s => s.start())
      );
    },

    async stop() {
      await Promise.all(
        Object.values(servers).map(s => s.stop())
      );
    },

    async restart() {
      // Restart all atomically
      await this.stop();
      const newContext = createContext(context.config);

      servers.api = createApiServer(newContext, context.config.apiPort);
      servers.admin = createAdminServer(newContext, context.config.adminPort);
      servers.metrics = createMetricsServer(newContext, context.config.metricsPort);

      await this.start();
    }
  };
}
```

All servers share context but bind to different ports.

## Health and Readiness

### The Health Endpoint

Every server needs one:

```javascript
routes.push({
  method: 'GET',
  pattern: new URLPattern({ pathname: '/health' }),
  handler: async (context, request, response) => {
    // Check critical dependencies
    const checks = {
      database: await checkDatabase(context),
      redis: await checkRedis(context),
      disk: await checkDiskSpace()
    };

    const healthy = Object.values(checks).every(v => v === true);

    response.statusCode = healthy ? 200 : 503;
    response.end(JSON.stringify({
      status: healthy ? 'healthy' : 'unhealthy',
      checks,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    }));
  }
});

async function checkDatabase(context) {
  try {
    await context.db.execute('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
```

## Testing with Lifecycle

### Clean Test Structure

```javascript
describe('API Tests', () => {
  let context;
  let server;

  beforeEach(async () => {
    context = createTestContext();
    server = createServer(context);
    await server.start();
  });

  afterEach(async () => {
    await server.stop();  // Guaranteed cleanup
  });

  it('should handle requests', async () => {
    const port = server.getPort();
    const response = await fetch(`http://localhost:${port}/users`);
    assert.equal(response.status, 200);
  });
});
```

No leaked servers. No port conflicts. No hanging tests.

### Parallel Test Execution

```javascript
// Each test gets its own server on a random port
describe.concurrent('Parallel Tests', () => {
  it('test 1', async () => {
    const server = createServer(createTestContext());
    await server.start();  // Port 54321
    // ...
    await server.stop();
  });

  it('test 2', async () => {
    const server = createServer(createTestContext());
    await server.start();  // Port 54322 (different!)
    // ...
    await server.stop();
  });
});
```

## Drain and Replace

For zero-downtime deployments:

```javascript
export function createServer(context) {
  let isDraining = false;

  return {
    async drain() {
      isDraining = true;

      // Stop accepting new connections
      httpServer.close();

      // Wait for existing connections to finish
      while (connections.size > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    },

    // In request handler
    async handleRequest(request, response) {
      if (isDraining) {
        response.statusCode = 503;
        response.setHeader('Connection', 'close');
        response.end('Server is draining');
        return;
      }

      // Normal request handling
    }
  };
}
```

## Summary

Proper server lifecycle gives you:
- **Reliable tests**: No leaked resources or port conflicts
- **Graceful shutdowns**: No lost data or angry users
- **Hot reloading**: Deploy without downtime
- **Resource management**: Everything cleaned up properly
- **Production stability**: Predictable behavior under load

It's more code upfront, but it prevents countless hours of debugging mysterious test failures, memory leaks, and production incidents.

Next, we'll explore how models and controllers achieve true separation of concerns—why your HTTP layer should never touch your database.