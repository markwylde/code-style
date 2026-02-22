import { randomUUID } from "node:crypto";
import { ConflictError, NotFoundError } from "../errors.ts";
import type {
  CreateTodoInput,
  Todo,
  UpdateTodoInput,
} from "../schemas/todos.ts";
import type { Context } from "../types.ts";

function assertContextAlive(context: Context): void {
  if (!context.lifecycle.alive) {
    throw new Error("Context is closed");
  }
}

export async function listTodos(context: Context): Promise<Todo[]> {
  assertContextAlive(context);
  return context.db.todos.getAll();
}

export async function getTodoById(
  context: Context,
  todoId: string,
): Promise<Todo> {
  assertContextAlive(context);
  const todo = context.db.todos.getById(todoId);
  if (!todo) {
    throw new NotFoundError("Todo not found");
  }
  return todo;
}

export async function createTodo(
  context: Context,
  input: CreateTodoInput,
): Promise<Todo> {
  assertContextAlive(context);

  const existing = context.db.todos
    .getAll()
    .find((todo) => todo.title.toLowerCase() === input.title.toLowerCase());

  if (existing) {
    throw new ConflictError("Todo title must be unique");
  }

  const now = new Date().toISOString();
  const todo: Todo = {
    id: randomUUID(),
    title: input.title,
    completed: false,
    createdAt: now,
    updatedAt: now,
  };

  context.db.todos.insert(todo);
  return todo;
}

export async function updateTodo(
  context: Context,
  todoId: string,
  input: UpdateTodoInput,
): Promise<Todo> {
  assertContextAlive(context);

  const current = context.db.todos.getById(todoId);
  if (!current) {
    throw new NotFoundError("Todo not found");
  }

  if (
    input.title &&
    input.title.toLowerCase() !== current.title.toLowerCase()
  ) {
    const duplicate = context.db.todos
      .getAll()
      .find(
        (todo) =>
          todo.id !== todoId &&
          todo.title.toLowerCase() === input.title?.toLowerCase(),
      );

    if (duplicate) {
      throw new ConflictError("Todo title must be unique");
    }
  }

  const updated: Todo = {
    ...current,
    ...input,
    updatedAt: new Date().toISOString(),
  };

  context.db.todos.replace(updated);
  return updated;
}

export async function deleteTodo(
  context: Context,
  todoId: string,
): Promise<void> {
  assertContextAlive(context);
  const current = context.db.todos.getById(todoId);
  if (!current) {
    throw new NotFoundError("Todo not found");
  }
  context.db.todos.deleteById(todoId);
}
