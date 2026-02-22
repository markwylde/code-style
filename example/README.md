# Todo API Example

A working Node.js todo API that follows the code-style spec:

- Context pattern with explicit dependencies
- Thin controllers + model-only data logic
- URLPattern routing
- Centralized error handling
- Server lifecycle with `start`, `stop`, and `restart`
- Health/readiness endpoint (`GET /health`)
- OpenAPI document endpoint (`GET /openapi.json`)
- Integration tests using the same server factory as production

## Quick start

```bash
cd example
npm install
npm run start
```

This example auto-loads `.env.example` by default, and `.env` if present (for local overrides). It runs directly with Node type stripping (`node src/main.ts`), no build step.

## Endpoints

- `GET /health`
- `GET /openapi.json`
- `GET /todos`
- `POST /todos`
- `GET /todos/:todoId`
- `PUT /todos/:todoId`
- `DELETE /todos/:todoId`

## Test

```bash
cd example
npm test
```
