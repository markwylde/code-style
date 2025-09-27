---
title: "Introduction"
tagline: "A practical, framework‑free Node.js blueprint"
subtitle: "Build clear, testable systems with the context pattern"
date: "2025-04-03"
category: "Introduction"
tags: ["functional", "nodejs", "architecture", "monorepo"]
order: 1
---

## What This Is

This guide is a pragmatic blueprint for building production‑grade Node.js systems without a heavyweight framework. It shows how to structure an application as a set of small, focused functions that all take an explicit context object, keeping dependencies clear and testing easy. You get strong lifecycle guarantees, type‑safe boundaries, and minimal magic.

Instead of wiring a pile of middleware and hoping for the best, you’ll learn a consistent approach that scales: a portable server lifecycle, thin HTTP controllers, model‑centric data logic, and explicit external services — all stitched together through a typed context.

## Who It’s For

- Engineers who prefer clarity over convention and want control of their stack
- Teams migrating from framework‑driven apps to a leaner, testable architecture
- Builders of HTTP APIs and React UIs that value portability and reliability

## What You’ll Build

A small but complete architecture with a clear separation of concerns:

- Context: the single, explicit object that holds dependencies (db, config, services)
- Server: portable HTTP servers with start/stop/restart and health checks
- Controllers: thin HTTP adapters that validate, authorize, and call models
- Models: domain + data access (Drizzle ORM), free of HTTP concerns
- Services: integrations and cross‑boundary side effects (email, payments)
- UI: React + TypeScript + CSS Modules compiled to static assets

Typical monorepo layout (workspaces):

```
project/
├── packages/
│   ├── api/        # Node HTTP servers, models, controllers
│   ├── ui/         # React app built to static assets
│   └── admin-ui/   # Optional admin React app
├── package.json    # npm workspaces
└── tsconfig.json
```

## Core Principles

- Explicit over implicit: no hidden middleware or globals
- Functions over classes: single‑purpose exports, first arg is `context`
- Minimal dependencies: prefer Node built‑ins; adopt libraries intentionally
- Strong boundaries: controllers ≠ models; services handle external effects
- Lifecycle guarantees: start only when ready; stop releases all resources
- Type‑safe I/O: zod for external shapes; clean TS types for internals
- Test the real system: use a real DB; only mock true third‑party services

## How It Fits Together

```ts
// Controller (HTTP layer)
export async function postUsersController(context, request, response) {
  const body = await readBody(request);
  const data = CreateUserSchema.parse(JSON.parse(body));
  const user = await createUser(context, data); // model
  response.statusCode = 201;
  response.end(JSON.stringify(user));
}

// Model (data + business rules)
export async function createUser(context, data) {
  const [row] = await context.db.insert(users).values(data).returning();
  return toApiUser(row);
}
```

- Controllers parse/validate inputs, enforce auth, call models/services, and shape HTTP responses.
- Models own queries, rules, and data transformations. No HTTP concerns.
- Context owns resources (db pools, config, providers) and cleans them up on stop.
- Servers expose a readiness endpoint and implement `start()`, `stop()`, `restart()`.

## Why Not a Framework?

Frameworks promise convenience but trade away visibility and control. Middleware mutates shared objects, magic hides flow, and upgrades become risky. Here, every step is explicit and testable. When something breaks, you debug your code — not a stack of plugins.

See: `Why Functional Node.js?` for the cost of magic and the benefits of clarity.

## What This Is Not

- Not a DI container or annotation framework
- Not server‑side rendering — React UIs are compiled to static assets
- Not a one‑size‑fits‑all toolkit — it’s a set of composable patterns

## Quick Start (Adopting the Pattern)

- Define `Config` and `Context` types; implement `createContext(config)` that constructs db/services and registers cleanup.
- Build `createServer(context)` that wires routes with `URLPattern` and adds a `/health` readiness endpoint.
- Write your first model (pure function, uses `context.db`) and controller (validates with zod, calls the model).
- Add tests using Node’s built‑in runner; run against a real test database; mock only third‑party APIs.
- Keep ports in config, no hard‑coded numbers; rely on lifecycle methods instead of arbitrary sleeps.

## How to Use This Guide

Read in order or jump to what you need:

- Why Functional Node.js — motivation and trade‑offs
- The Context Pattern — dependency injection without magic
- Server Lifecycle — start/stop/restart guarantees and health
- Models & Controllers — clean, testable boundaries
- Error Handling — bubble errors; translate at HTTP edge
- Testing Philosophy — what to mock (and what not to)
- Dependencies — minimal, intentional adoption
- Practical Patterns — composition, services, and examples

Each section includes copy‑pasteable snippets and concrete conventions (e.g., `controllers/users/[id]/get.ts`, URLPattern routing, zod schemas, Drizzle models). Start small, keep functions pure, and let the context do the wiring.

## Next Up

Head to `Why Functional Node.js?` to see the problems this architecture solves and the benefits you’ll gain by adopting it.
