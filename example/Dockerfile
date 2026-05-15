FROM node:24-bookworm-slim AS base

WORKDIR /app

COPY package.json package-lock.json ./
COPY services/api/package.json ./services/api/package.json

RUN npm ci --workspaces

COPY services ./services

FROM base AS api-dev

EXPOSE 4001
CMD ["npm", "run", "dev", "--workspace=@code-style/example-api"]
