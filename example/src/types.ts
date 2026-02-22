import type http from "node:http";

export type Config = {
  todoApiPort: number;
  publicBaseUrl: string;
  maxBodyBytes: number;
};

export type TodoRecord = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TodoStore = {
  getAll: () => TodoRecord[];
  getById: (id: string) => TodoRecord | undefined;
  insert: (todo: TodoRecord) => void;
  replace: (todo: TodoRecord) => void;
  deleteById: (id: string) => void;
};

export type LifecycleState = {
  alive: boolean;
};

export type Context = {
  config: Config;
  db: {
    todos: TodoStore;
  };
  lifecycle: LifecycleState;
  destroy: () => Promise<void>;
};

export type ControllerOpenApi = {
  summary: string;
  responses: Record<string, unknown>;
  requestBody?: unknown;
};

export type ControllerModule = {
  schema?: {
    params?: unknown;
    query?: unknown;
    body?: unknown;
    response?: unknown;
  };
  openapi: ControllerOpenApi;
  handler: (args: {
    context: Context;
    request: http.IncomingMessage;
    response: http.ServerResponse;
    params: unknown;
    query: unknown;
  }) => Promise<void>;
};

export type Route = {
  method: string;
  pattern: URLPattern;
  pathname: string;
  controller: Promise<{ default: ControllerModule }>;
};
