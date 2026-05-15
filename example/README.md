# Todo API Example

A working Node.js todo API that follows the code-style spec principles in a minimal workspace example:

- Context pattern with explicit dependencies
- Thin controllers + model-only data logic
- URLPattern routing
- Centralized error handling
- Server lifecycle with `start`, `stop`, and `restart`
- Health/readiness endpoint (`GET /health`)
- OpenAPI document endpoint (`GET /openapi.json`)
- Integration tests using the same server factory as production
- Runnable service code under `services/api`
- Docker Compose Watch for normal local development

This example is intentionally smaller than the full monorepo structure shown in the main spec: it has one runnable service and no reusable packages yet. It still uses the same service/workspace boundary the spec expects.

## Quick start

```bash
cd example
docker compose up --build --watch
```

The API will be available at `http://127.0.0.1:4001`.

Docker is the normal local runtime. The API runs directly with Node type stripping (`node src/main.ts`) inside the container, with no build step. Compose Watch syncs source changes into the container and lets Node's `--watch` mode restart the service.

For quick host-side checks, you can still run the workspace scripts directly if you already have Node installed:

```bash
cd example
npm install
npm test
```

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
