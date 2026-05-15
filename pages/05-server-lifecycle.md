---
title: "Server Lifecycle"
tagline: "Start when ready. Stop when clean. Restart without guessing."
subtitle: "The Runtime Contract For The Core"
date: "2025-04-03"
category: "Build The Core"
tags: ["server", "lifecycle", "production", "testing", "readiness"]
order: 5
---

:::warning
Server lifecycle is not decoration. Tests and production should use the same server factory, the same start/stop/restart API, and the same readiness checks.
:::

A server is not just `http.createServer(...).listen(...)`. It is a managed runtime object with clear guarantees:

```typescript
const context = await createContext(config);
const server = createServer(context);

await server.start();
await server.restart();
await server.stop();
```

Those methods are the contract.

- `start()` resolves only after every HTTP server is listening and healthy.
- `stop()` resolves only after listeners are closed, sockets are destroyed, timers are cleared, and owned resources are released.
- `restart()` brings the same managed server instance back on the same configured ports and waits for health before resolving.
- `context` is exposed for tests and lifecycle-aware work.
- Running HTTP server references are exposed for diagnostics and advanced tests.

If you need a brand-new dependency graph, do that explicitly:

```typescript
await server.stop();

const nextContext = await createContext(loadConfig(process.env));
const nextServer = createServer(nextContext);

await nextServer.start();
```

Restart does not secretly rebuild context. Hidden context rebuilds make stale work, cleanup, and tests harder to reason about.

## The Shape

For a single HTTP server, keep one `createServer(...)` factory. Do not introduce `createApiServer(...)` or other nested factories until the project actually runs multiple distinct HTTP servers.

```typescript
export type ManagedServer = {
  context: Context;
  servers: {
    api: http.Server | null;
  };
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
};
```

The object is small on purpose. It is easy to use in `main.ts`, tests, local scripts, and production process handlers.

## Start

`start()` binds the configured ports, starts accepting requests, and waits for routed health endpoints to respond. It should fail loudly if config is wrong, the port is unavailable, or readiness never arrives.

```typescript
export function createServer(context: Context): ManagedServer {
  const sockets = new Set<net.Socket>();
  const servers = {
    api: null as http.Server | null,
  };

  async function start() {
    if (servers.api) {
      throw new Error("Server already started");
    }

    const api = http.createServer(createRouter(context, routes));
    servers.api = api;

    api.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => {
        sockets.delete(socket);
      });
    });

    await listen(api, context.config.port);
    await waitForHealth(new URL("/health", context.config.publicBaseUrl));
  }

  async function stop() {
    if (!servers.api) return;

    context.state.status = "closing";

    await closeServer(servers.api);
    servers.api = null;

    for (const socket of sockets) {
      socket.destroy();
    }
    sockets.clear();

    await context.destroy();
  }

  async function restart() {
    if (context.state.status === "closed") {
      throw new Error("Cannot restart a stopped server; create a fresh context");
    }

    await closeForRestart();
    await start();
  }

  async function closeForRestart() {
    if (!servers.api) return;

    context.state.status = "closing";

    await closeServer(servers.api);
    servers.api = null;

    for (const socket of sockets) {
      socket.destroy();
    }
    sockets.clear();

    context.state.status = "live";
  }

  return {
    context,
    servers,
    start,
    stop,
    restart,
  };
}
```

`restart()` uses the same managed instance and the same configured port. A full context rebuild is a separate operation: stop, create a new context, create a new server, start.

## Stop

`stop()` is the terminal cleanup path for a managed server instance. It should be safe to call more than once.

```typescript
async function closeServer(server: http.Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
```

Track open sockets because `server.close()` stops accepting new connections but can wait indefinitely for idle keep-alive sockets. Destroying sockets during shutdown keeps tests and deploys from hanging.

```typescript
for (const socket of sockets) {
  socket.destroy();
}
sockets.clear();
```

Do the same for intervals, queues, database pools, and clients through `context.destroy()`. If context creates it, context owns cleanup for it.

## Readiness

Every HTTP server needs a lightweight routed health endpoint. It is a normal route, not a branch inside `createServer`.

```typescript
// routes.ts
export const routes: Route[] = [
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/health" }),
    controller: import("./controllers/health/get.ts"),
  },
];
```

```typescript
// controllers/health/get.ts
import type { Handler } from "../../utils/createRouter.ts";

export const schema = {};

export async function handler({ context, response }: Handler<typeof schema>) {
  await context.db.execute(sql`select 1`);

  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(
    JSON.stringify({
      status: "healthy",
      instanceId: context.state.instanceId,
    }),
  );
}
```

The lifecycle code can poll that endpoint, and callers do not need arbitrary sleeps.

```typescript
export async function waitForHealth(url: URL) {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server may not have bound yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Server did not become healthy: ${url.href}`);
}
```

Readiness should prove the server can do useful work. Keep it lightweight, but check critical dependencies such as the database when the application cannot serve without them.

## Ports And Bindings

Ports come from validated config. Avoid hard-coded numeric ports in server code.

```typescript
export type Config = {
  port: number;
  publicBaseUrl: string;
  databaseUrl: string;
  jwtSecret: string;
  maxBodyBytes: number;
};
```

Tests can use an explicit random port setting such as `port: 0`, then read the bound address from the server after `start()` resolves.

```typescript
function getServerUrl(server: http.Server) {
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Server is not listening on a TCP port");
  }

  return new URL(`http://127.0.0.1:${address.port}`);
}
```

Production keeps stable ports through explicit configuration. Local defaults belong in `.env.example`, not in runtime fallback code.

## Process Signals

`main.ts` wires process signals to the same lifecycle API used by tests.

```typescript
async function main() {
  const config = loadConfig(process.env);
  const context = await createContext(config);
  const server = createServer(context);

  process.on("SIGTERM", () => {
    void shutdown(server, "SIGTERM");
  });

  process.on("SIGINT", () => {
    void shutdown(server, "SIGINT");
  });

  await server.start();
}

async function shutdown(server: ManagedServer, signal: string) {
  try {
    console.info(`Stopping server after ${signal}`);
    await server.stop();
    process.exitCode = 0;
  } catch (error) {
    console.error("Server stop failed", error);
    process.exitCode = 1;
  }
}
```

Do not call `process.exit()` in the signal handler. Set `process.exitCode` and let cleanup finish.

## Multiple HTTP Servers

Some projects need more than one HTTP server: API, admin, metrics, or webhooks. Treat them uniformly inside the same lifecycle object.

```typescript
export type ServerPorts = {
  api: number;
  admin: number;
  metrics: number;
};

export function createServer(context: Context): ManagedServer {
  const servers = {
    api: null as http.Server | null,
    admin: null as http.Server | null,
    metrics: null as http.Server | null,
  };

  function buildServers() {
    servers.api = http.createServer(createRouter(context, apiRoutes));
    servers.admin = http.createServer(createRouter(context, adminRoutes));
    servers.metrics = http.createServer(createRouter(context, metricsRoutes));
  }

  async function closeServers() {
    await Promise.all(
      [servers.api, servers.admin, servers.metrics]
        .filter((server): server is http.Server => Boolean(server))
        .map((server) => closeServer(server)),
    );

    servers.api = null;
    servers.admin = null;
    servers.metrics = null;
  }

  return {
    context,
    servers,
    async start() {
      if (servers.api || servers.admin || servers.metrics) {
        throw new Error("Server already started");
      }

      buildServers();
      const { api, admin, metrics } = servers;

      if (!api || !admin || !metrics) {
        throw new Error("HTTP servers were not created");
      }

      await Promise.all([
        listen(api, context.config.ports.api),
        listen(admin, context.config.ports.admin),
        listen(metrics, context.config.ports.metrics),
      ]);

      await Promise.all([
        waitForHealth(new URL("/health", context.config.apiBaseUrl)),
        waitForHealth(new URL("/health", context.config.adminBaseUrl)),
        waitForHealth(new URL("/health", context.config.metricsBaseUrl)),
      ]);
    },
    async stop() {
      await closeServers();
      await context.destroy();
    },
    async restart() {
      if (context.state.status === "closed") {
        throw new Error("Cannot restart a stopped server; create a fresh context");
      }

      await closeServers();
      await this.start();
    },
  };
}
```

Only split factories when the servers have genuinely separate responsibilities. Otherwise, the extra layer just hides the lifecycle.

## Test Lifecycle

Tests should use the real server factory and make real HTTP requests.

```typescript
test("GET /users returns users", async () => {
  const context = await createTestContext({ port: 0 });
  const server = createServer(context);

  try {
    await server.start();

    const api = server.servers.api;
    if (!api) throw new Error("API server did not start");

    const url = getServerUrl(api);
    const response = await fetch(new URL("/users", url));

    assert.equal(response.status, 200);
  } finally {
    await server.stop();
  }
});
```

This verifies routing, controller wiring, error handling, database access, and cleanup together. It also keeps CI honest: if the server leaks sockets or leaves pools open, tests will show it.

## Lifecycle Checklist

- Build config before context; build context before server.
- Use the same `createServer(context)` in tests and production.
- Expose `/health` through the route table and a controller.
- Make `start()` wait for listening ports and readiness.
- Make `stop()` idempotent and terminal for the server instance.
- Keep restart on the same configured ports.
- Rebuild fresh context explicitly, never as hidden restart behavior.
- Track sockets and destroy them during shutdown.
- Ensure background work checks context state before using resources.

Lifecycle is where the core becomes operational. The rest of the architecture is easier to trust when starting and stopping the app is boring.
