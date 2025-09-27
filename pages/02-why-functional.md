---
title: "Why Functional Node.js?"
tagline: "Frameworks promise magic. Let's deliver understanding instead."
date: "2025-04-03"
category: "Introduction"
tags: ["functional", "nodejs", "architecture"]
order: 2
---

:::warning
**The Dependency Explosion**

You've been there. Starting a new Node.js project, you reach for Express. Then you need body parsing, so you add `express-body-parser`. Authentication? Add `passport`. Sessions? `express-session`. Rate limiting? `express-rate-limit`.

Before you know it, your `package.json` has 200 dependencies, your `node_modules` folder is 500MB, and when Express releases a breaking change, your entire middleware stack collapses like a house of cards.
:::

## The Hidden Cost of Magic

```javascript
// This looks simple, but what's really happening?
app.use(bodyParser.json())
app.use(passport.initialize())
app.use(session({ secret: 'keyboard cat' }))

app.post('/api/users', (request, response) => {
  // Where did request.body come from?
  // How did request.user get attached?
  // What mutated request.session?
  console.log(request.body, request.user, request.session)
})
```

The problem isn't the functionality—it's the magic. Middleware mutates objects you don't control in ways you can't predict. When something breaks, you're debugging through 10 layers of abstraction to find where `request.body` went wrong.

## The Functional Alternative

What if instead of magic, we had functions?

```javascript
export async function createUserController(context, request, response) {
  // Explicit: we parse the body ourselves
  const body = await readBody(request);

  // Explicit: we validate with our schema
  const userData = CreateUserSchema.parse(JSON.parse(body));

  // Explicit: we call our model with context
  const user = await createUser(context, userData);

  // Explicit: we send the response
  response.statusCode = 201;
  response.end(JSON.stringify(user));
}
```

No magic. No mutations. No surprises. Every step is visible, testable, and debuggable.

## Why This Architecture?

:::info
**The Core Philosophy**

This architecture isn't about being different—it's about being honest about what actually matters in production: maintainability, debuggability, and understanding.
:::

### 1. **Simplicity Over Convenience**
Frameworks promise convenience but deliver complexity. This architecture chooses simplicity: plain functions that do one thing well.

### 2. **Explicit Over Implicit**
When you read our code, you see everything that happens. No hidden middleware, no magical decorators, no mysterious mutations.

### 3. **Testable By Design**
When everything is a function that takes context, testing becomes trivial:

```javascript
it('should create a user', async () => {
  const context = createTestContext();
  const user = await createUser(context, {
    email: 'test@example.com',
    name: 'Test User'
  });
  assert.ok(user.id);
});
```

### 4. **Dependencies You Control**
Every dependency is passed through context. No globals, no singletons, no surprises. Need to mock an email service? Just pass a different context.

### 5. **Type-Safe ORM, Minimal Magic**
We use Drizzle, a proper ORM with minimal magic. It provides strong types and ergonomic query helpers while keeping behavior explicit and predictable. Use its helpers or plain SQL when it makes sense—the goal is clarity, not clever abstractions.

## The Cost-Benefit Analysis

**What You Lose:**
- The familiarity of Express-style routing
- Thousands of middleware packages
- The ability to copy-paste from Stack Overflow
- Framework-specific knowledge that transfers between projects

**What You Gain:**
- A codebase you can understand completely
- Tests that run in milliseconds, not seconds
- Deployments measured in megabytes, not gigabytes
- The ability to debug any issue without leaving your code
- Knowledge of Node.js fundamentals that never goes out of style

## Who Is This For?

:::tip
**Perfect For:**
- Teams that value long-term maintainability
- Developers who want to understand their entire system
- Projects where debugging time matters
- Applications that need predictable performance and behavior
:::

## The Philosophy

> "Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away." - Antoine de Saint-Exupéry

We apply this philosophy ruthlessly:
- **No classes, functions will do just fine.**
- **No frameworks, the standard library suffices.**
- **No over abstractions. Abstract when needed.**
- **No dependencies without serious consideration.**

## Getting Started

This guide will walk you through:
1. How the context pattern replaces dependency injection frameworks
2. Why server lifecycle management prevents memory leaks
3. How models and controllers achieve true separation of concerns
4. Why we let errors bubble instead of catching everywhere
5. When to mock (external services) and when not to (your database)
6. How to evaluate whether you really need that npm package

Each concept builds on the previous one. By the end, you'll understand not just HOW to build this way, but WHY it leads to more maintainable, testable, and understandable applications.

Let's begin with the foundation: the context pattern.
