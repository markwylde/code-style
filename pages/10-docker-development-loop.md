---
title: "Docker Development Loop"
tagline: "One command should run the project everywhere."
subtitle: "Use Compose Watch as the shared runtime for local development and tests"
date: "2026-05-15"
category: "Operations"
tags: ["docker", "compose", "development", "operations"]
order: 10
---

Local development should not depend on a carefully prepared laptop.
A fresh clone should run on Linux, macOS, and Windows with Docker as the only required runtime.

```bash
docker compose up --build --watch
```

That command is the development loop.
It starts every project-owned service, builds app images, syncs source changes into containers, and keeps native dependencies installed for the container OS rather than the host OS.

:::info
**Docker Is The Runtime Contract**

Do not require host-installed Node, PostgreSQL, Redis, mail services, object stores, or queues for normal development. If the project owns it, put it in `docker-compose.yml`.
:::

## What Belongs In Compose

Every runnable part of the project belongs in `docker-compose.yml`:

- API services
- UI and admin UI dev servers
- Workers and schedulers
- PostgreSQL, Redis, queues, caches, object stores, and mail test services
- Any process that has a port, lifecycle, deployment target, or runtime dependency

Image-only infrastructure services, such as `postgres`, still belong in Compose even when they do not need watch rules.

## Compose Watch, Not Bind Mounts

Do not rely on bind-mounted source trees for application code.
Bind mounts behave differently across host operating systems and Docker VM setups, and they can mix host artifacts with container artifacts.

Use Compose Watch:

- `sync` for source files the process can reload or watch inside the container.
- `sync+restart` for configuration or source changes that need a process restart.
- `rebuild` for dependency and image-shaping files.

```yaml
services:
  api:
    build:
      context: .
      target: api-dev
    command: npm run dev --workspace=@project/api
    environment:
      DATABASE_URL: postgresql://app:app@postgres:5432/app
      PORT: "3000"
      PUBLIC_BASE_URL: http://localhost:3000
      MAX_BODY_BYTES: "1048576"
    ports:
      - "3000:3000"
    depends_on:
      - postgres
    develop:
      watch:
        - action: sync
          path: ./services/api/src
          target: /app/services/api/src
          initial_sync: true
        - action: sync
          path: ./services/api/tests
          target: /app/services/api/tests
          initial_sync: true
        - action: rebuild
          path: ./services/api/package.json
        - action: rebuild
          path: ./package-lock.json
        - action: rebuild
          path: ./Dockerfile

  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: app
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  postgres-data:
```

After changing `docker-compose.yml`, restart the loop with `docker compose up --build --watch` so Compose reloads service and watch configuration.

## Watch Internal Packages Explicitly

When a service imports an internal package from `packages/`, sync that package source into the service container and rebuild when its package metadata changes.

```yaml
develop:
  watch:
    - action: sync
      path: ./services/api/src
      target: /app/services/api/src
      initial_sync: true
    - action: sync
      path: ./packages/discovery/src
      target: /app/packages/discovery/src
      initial_sync: true
    - action: rebuild
      path: ./services/api/package.json
    - action: rebuild
      path: ./packages/discovery/package.json
    - action: rebuild
      path: ./package-lock.json
```

The service container needs the same source graph that Node resolves at runtime.
Do not assume a workspace package updates automatically unless the watch rules say so.

## Keep Host Artifacts Out

Never sync these into containers:

- `node_modules`
- build output such as `dist`
- coverage output
- `.git`
- OS-specific files
- editor caches

Dependencies should be installed inside the image.
That keeps native packages matched to the container OS and architecture.

```yaml
develop:
  watch:
    - action: sync
      path: ./services/ui/src
      target: /app/services/ui/src
      initial_sync: true
      ignore:
        - node_modules/
        - dist/
        - coverage/
```

App images must also include the binaries Compose Watch needs, including `stat`, `mkdir`, and `rmdir`, and the container user must be able to write to watched targets.

## Configuration In The Loop

The app should fail fast when required configuration is missing.
Do not hide missing settings with runtime fallbacks.

Compose is the right place to make local values explicit:

```yaml
environment:
  PORT: "3000"
  DATABASE_URL: postgresql://app:app@postgres:5432/app
  PUBLIC_BASE_URL: http://localhost:3000
  MAX_BODY_BYTES: "1048576"
  JWT_SECRET: local-development-secret
```

The application reads these settings and validates them at startup.
It should not quietly replace them with defaults in production code.

## Testing Inside The Same World

The Docker loop and the test loop should agree.
Local tests and CI should use the same Compose-owned dependencies wherever practical.

Useful commands usually look like this:

```bash
docker compose up --build --watch
docker compose exec api npm test --workspace=@project/api
docker compose exec api npm run typecheck --workspace=@project/api
```

CI can run without `--watch`, but it should still build the same images and start the same owned services.

## Operational Checklist

Before calling the development loop healthy, check:

- A fresh clone runs with `docker compose up --build --watch`.
- Every owned runtime dependency is declared in Compose.
- Source-built services use `develop.watch`.
- Source uses `sync` with `initial_sync: true`.
- Dependency metadata and Dockerfiles use `rebuild`.
- Internal package source is synced into containers that import it.
- Host `node_modules`, build output, coverage, and `.git` stay out of containers.
- Tests use the Compose-owned database and services instead of host installs.

The payoff is boring portability.
Everyone runs the same system, so bugs reproduce where the team can actually fix them.
