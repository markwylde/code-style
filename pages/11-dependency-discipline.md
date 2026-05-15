---
title: "Dependency Discipline"
tagline: "Every install becomes part of your maintenance surface."
subtitle: "How to decide when a dependency earns its place"
date: "2026-05-15"
category: "Operations"
tags: ["dependencies", "maintenance", "nodejs", "architecture"]
order: 11
---

Dependencies are not free.
Every package brings code you did not write, release schedules you do not control, security updates you must triage, and APIs your project may become shaped around.

The default answer is no.
The useful answer is sometimes yes.

:::warning
**Dependency Budget**

Install dependencies for hard, well-bounded problems. Prefer Node and browser built-ins for ordinary plumbing. Avoid frameworks that force the rest of the codebase to adopt their vocabulary.
:::

## The Evaluation Test

Before adding a package, answer these questions:

- Does it solve a genuinely hard problem?
- Is the package focused on one responsibility?
- Does it work with Node's native TypeScript runtime without special loaders?
- Can business logic still run without the package's framework or decorators?
- Is it actively maintained and widely enough used to trust?
- Is the transitive dependency graph reasonable?
- Could the team replace or vendor it if needed?

Most packages fail because they solve a small problem by importing a large ecosystem.

Good candidates:

- Database drivers and clients for real protocols.
- zod or another focused validation library.
- Cryptography libraries where rolling your own would be reckless.
- React, Vite, and build tooling for the UI service.
- Small single-purpose protocol helpers when Node does not provide the primitive.

Poor candidates:

- Trivial utilities that are a few clear lines of code.
- HTTP frameworks that make controllers depend on decorators, middleware mutation, or framework request objects.
- Express middleware stacks for parsing, validation, auth, sessions, and logging.
- Libraries that require runtime TypeScript transforms such as `ts-node`, `tsx`, decorators, or path alias magic.
- Packages that mainly wrap a built-in API with a new dialect.

## Built-Ins First

Modern Node and JavaScript already cover a lot of ground:

```typescript
const unique = [...new Set(values)];
const flattened = nested.flat();
const id = crypto.randomUUID();
const response = await fetch(url);
const path = new URL(request.url, publicBaseUrl).pathname;
```

Use `node:http` for HTTP servers, `URLPattern` for route matching, `fetch` for HTTP calls, `crypto` for IDs and hashing primitives, and `node:test` for tests unless the project has a clear reason to expand.

Built-in does not always mean better.
It does mean the burden of proof is on the new package.

## Keep Frameworks At The Edge

This guide favors plain functions, explicit context, and controllers that are thin HTTP adapters.
A dependency should not pull domain code into a framework-specific shape.

```typescript
// Good: domain logic is plain TypeScript.
export async function createTodo(
  context: Context,
  input: CreateTodoInput,
) {
  const parsed = CreateTodoSchema.parse(input);
  return insertTodo(context, parsed);
}

// Risky: domain behavior is coupled to framework-specific objects.
export async function createTodoAction(request: FrameworkRequest) {
  const input = request.validatedBody<CreateTodoInput>();
  return request.container.todoService.create(input);
}
```

The escape hatch test is simple: can the model or service be imported and tested without the framework?
If not, the dependency owns more of the system than it should.

## Middleware Is A Dependency Shape

Middleware often looks small and composable, but it commonly mutates request and response objects in hidden order.

```typescript
// Hidden behavior depends on registration order.
app.use(bodyParser.json());
app.use(session());
app.use(passport.initialize());
app.use(passport.session());
```

Prefer explicit utilities:

```typescript
export async function postTodoController(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const session = await requireSession(context, request);
  const body = await getBodyFromRequest(context, request, "json");
  const todo = await createTodo(context, { ...body, ownerId: session.userId });

  sendJson(response, 201, todo);
}
```

The call site says what is happening.
Tests can exercise each step through the real controller and server.

## Native TypeScript Runtime Compatibility

Source should run on Node's native TypeScript support.
That means dependencies and local patterns should not require runtime transforms.

Avoid dependencies or examples that require:

- decorators
- parameter properties
- namespaces or enums
- transpiled path aliases
- custom TypeScript loaders
- framework-specific compilation steps for server code

Use `tsc --noEmit` for type checking, but keep runtime imports valid for Node.

## Internal Packages Are Dependencies Too

Top-level `packages/` are reusable Node libraries.
They need the same discipline as npm dependencies.

Create a package when code is genuinely reusable across services:

- design systems
- service discovery
- SDKs and typed clients
- feature flag clients
- narrowly scoped shared libraries

Do not create a package for:

- service-specific runtime side effects
- deployment configuration
- code with only one caller
- a catch-all utility library
- anything that owns a port, process, or Docker service

Packages must have explicit public exports and must stay independent of service runtime state.

## Review Checklist

For every new dependency, include the decision in the code review:

- What problem does it solve?
- Which built-in or local implementation was considered?
- How many direct and transitive packages does it add?
- Does it require runtime transforms or framework coupling?
- Is the API narrow enough to wrap or replace?
- What tests prove the dependency works in the real system?

For every internal package, ask:

- Is there more than one real service consumer?
- Are exports explicit and stable?
- Does it avoid owning process lifecycle, ports, environment loading, and Docker config?
- Does Compose Watch sync it into every service that imports it?

## The Good Kind Of Yes

Say yes when the dependency keeps the project simpler after you include its maintenance cost.
Say no when it mainly saves typing today by adding operational drag tomorrow.

The goal is not austerity.
The goal is code that remains portable, testable, and understandable after the first exciting week.
