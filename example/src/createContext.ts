import type { Config, Context, TodoRecord } from "./types.ts";

export function createContext(config: Config): Context {
  const todos = new Map<string, TodoRecord>();

  return {
    config,
    lifecycle: {
      alive: true,
    },
    db: {
      todos: {
        getAll: () => [...todos.values()],
        getById: (id: string) => todos.get(id),
        insert: (todo: TodoRecord) => {
          todos.set(todo.id, todo);
        },
        replace: (todo: TodoRecord) => {
          todos.set(todo.id, todo);
        },
        deleteById: (id: string) => {
          todos.delete(id);
        },
      },
    },
    destroy: async () => {
      todos.clear();
    },
  };
}
