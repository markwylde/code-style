---
title: "Abstraction Discipline"
tagline: "Extract when it clarifies, not when it feels clever."
subtitle: "A practical rule for when to create helpers"
date: "2026-02-22"
category: "Architecture"
tags: ["abstraction", "architecture", "maintainability"]
order: 11
---

Most overengineering comes from abstracting too early.
Most duplication debt comes from never abstracting.
The right tradeoff is timing.

## The Rule

- First implementation: keep it local and explicit.
- Second implementation: still prefer explicit code; verify the pattern is real.
- Third implementation (or obvious repeated pain): extract a focused abstraction.

This is a heuristic, not a law. If one extraction immediately lowers cognitive load in an important file, do it.

## What Counts As A Good Abstraction

A good abstraction should make call sites simpler and more readable.
It should remove concern-mixing, not just move code around.

Good examples in this style:

- `utils/createRouter.ts`: request parsing, route matching, schema validation, and transport error mapping.
- `utils/waitForHealth.ts`: readiness polling and retry policy.

These keep `createServer.ts` focused on lifecycle (`start`, `stop`, `restart`) instead of HTTP details.

## What To Avoid

- Pass-through wrappers that add another function name but no clarity.
- Abstracting after one use just to be “DRY”.
- Generic helpers that hide domain intent.
- Nested factories without a real need (for example adding `createApiServer` when there is only one server).

## Practical Checklist

Before extracting:

1. Is this repeated and stable?
2. Does extraction reduce cognitive load in the caller?
3. Is the new name more explicit than the inlined code?
4. Will this helper likely stay small and focused?

If most answers are "no", keep it inline.

## Server-Side Guideline

For a single HTTP server package:

- Keep one `createServer(...)` factory.
- Delegate reusable concerns to clear utilities.
- Avoid extra factory layers unless multiple servers actually exist.

This keeps lifecycle code obvious while still allowing targeted reuse.
