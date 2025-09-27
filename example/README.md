# Notes Example

A minimal implementation of the NodeJS Code Guide specification for a simple notes service. This project demonstrates the context pattern, portable HTTP server lifecycle, and OpenAPI documentation generation using Zod schemas.

## Packages

- `@notes/api` – Node HTTP server that exposes a JSON API for creating and listing notes.

## Getting Started

```bash
npm install
npm run dev
```

The API will be reachable at `http://localhost:4000` with an interactive health endpoint at `/health` and OpenAPI document at `/openapi`.

## Available Scripts

- `npm run dev` – Start the API in watch mode.
- `npm run start` – Start the API once.
- `npm run build` – Type-check the project.
- `npm run lint` – Run Biome for static analysis.
- `npm run test` – Compile and execute the Node.js built-in test runner.

## Example Requests

```bash
curl -X POST http://localhost:4000/notes \
  -H "Content-Type: application/json" \
  -d '{"title":"Daily Journal","content":"Write more code."}'

curl http://localhost:4000/notes
```

This example uses an in-memory data store for clarity. Real projects can replace the repository implementation inside the context without changing controllers or server lifecycle code.
