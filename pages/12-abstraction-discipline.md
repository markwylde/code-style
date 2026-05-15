---
title: "Abstraction Discipline"
tagline: "Extract when it reduces the reader's work."
subtitle: "A practical rule for helpers, packages, and server factories"
date: "2026-05-15"
category: "Architecture"
tags: ["abstraction", "architecture", "maintainability"]
order: 12
---

Most overengineering comes from abstracting too early.
Most duplication debt comes from refusing to abstract after the pattern is obvious.
The discipline is timing.

:::info
**Abstraction Rule**

Keep the first version local and explicit. Extract only when repetition is stable or when one focused helper clearly lowers cognitive load in an important file.
:::

## The Timing Heuristic

Use this as the default:

- First implementation: write the straightforward local version.
- Second implementation: still prefer explicit code; confirm the shape is real.
- Third implementation: extract a focused helper if the repeated code is stable.

This is a heuristic, not a ritual.
If a single extraction removes mixed concerns from a hot file, take it.
If three similar blocks are each clearer inline, leave them alone.

## What Good Abstractions Do

A good abstraction makes callers easier to read.
It should remove concern-mixing, not merely move lines into another file.

Good local examples in this style:

- `utils/createRouter.ts` keeps route matching, param/query validation, and HTTP error translation out of server lifecycle code.
- `utils/waitForHealth.ts` keeps readiness polling and retry policy out of `start()` and `restart()`.
- `utils/getBodyFromRequest.ts` keeps body-size enforcement and JSON parsing out of every controller.

The call site should become more direct:

```typescript
const body = await getBodyFromRequest(context, request);
const input = CreateTodoSchema.parse(body);
const todo = await createTodo(context, input);
sendJson(response, 201, todo);
```

The helper earns its place because the controller now reads like controller work.

## What Bad Abstractions Hide

Avoid abstractions that hide important operational details:

- Pass-through wrappers with a new name but no simpler call site.
- Generic helpers whose names erase domain meaning.
- Service locators or globals that hide dependencies instead of passing context.
- Nested server factories when the project runs one HTTP server.
- Shared packages created before there is a real second consumer.
- Helpers that swallow errors, invent runtime defaults, or choose configuration silently.

```typescript
// Bad: another layer without new meaning.
export function createApiServer(context: Context) {
  return createServer(context);
}

// Good: one server factory for one server.
const server = createServer(context);
```

Abstractions should clarify ownership.
If a reader has to jump through more files to understand less behavior, the abstraction is not paying rent.

## Utilities Versus Packages

Use `utils/` for small helpers owned by one service.
Create a top-level `packages/` library only when the code is reusable across services and can stand as an independent Node library.

Keep in `utils/`:

- body parsing for one API service
- response helpers for one HTTP transport
- local test builders
- service-specific formatting or mapping helpers

Consider `packages/` for:

- shared design system components
- typed clients used by multiple services
- service discovery
- feature flag clients
- stable SDK-style libraries

Do not put these in packages:

- process startup
- environment loading
- Docker or deployment config
- service-specific side effects
- one-off helpers with only one caller

Packages must expose explicit public exports and avoid service runtime state.
If a package import requires a particular service's context or environment, it is probably not a package yet.

## Server Factory Discipline

For a single HTTP server package, keep a single `createServer(context)` factory.
That factory owns lifecycle and returns the managed server object with `start()`, `stop()`, `restart()`, context, and server references.

Delegate focused concerns:

- route matching to a router utility
- readiness polling to a health helper
- request body parsing to controller utilities
- HTTP error formatting to one boundary handler

Do not add factories such as `createApiServer`, `createHttpApp`, or `buildApplication` unless the project actually runs multiple distinct servers with distinct responsibilities.

## Abstractions Must Preserve The Guide Contracts

Every helper should respect the same system rules:

- Pass `context` explicitly when the helper needs dependencies.
- Do not read hidden global state.
- Do not invent runtime defaults for app configuration.
- Do not catch errors unless translating meaning, preserving cleanup, or enforcing transaction semantics.
- Do not require TypeScript runtime transforms.
- Do not couple domain code to framework request/response types.

```typescript
// Good: dependencies and limits are explicit through context.
const body = await readBody(request, context.config.maxBodyBytes);

// Bad: hidden fallback changes behavior when configuration is missing.
const body = await readBody(request, Number(process.env.MAX_BODY_BYTES || 1048576));
```

The abstraction should make the rule easier to follow, not easier to bypass.

## Review Checklist

Before extracting, ask:

- Is the repeated pattern stable?
- Does the new name explain intent better than the inline code?
- Does the call site become easier to scan?
- Does the helper keep errors, config, and dependencies explicit?
- Is the helper small enough to test and understand?
- Would a future reader thank you for this file existing?

Before creating a package, ask:

- Are there at least two real consumers?
- Are public exports explicit?
- Can it run without a service process, port, or Docker service?
- Does Compose Watch sync its source into importing service containers?
- Is the dependency direction clean?

The best abstraction is not the cleverest one.
It is the one that lets the next change happen with less guessing.
