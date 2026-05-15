import { z } from "zod";

export const TodoSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  completed: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateTodoSchema = z.object({
  title: z.string().min(1).max(200),
});

export const UpdateTodoSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    completed: z.boolean().optional(),
  })
  .refine(
    (value) => value.title !== undefined || value.completed !== undefined,
    {
      message: "At least one field is required",
    },
  );

export const TodoParamsSchema = z.object({
  todoId: z.string().uuid(),
});

export const TodoListResponseSchema = z.object({
  todos: z.array(TodoSchema),
});

export type Todo = z.infer<typeof TodoSchema>;
export type CreateTodoInput = z.infer<typeof CreateTodoSchema>;
export type UpdateTodoInput = z.infer<typeof UpdateTodoSchema>;
export type TodoParams = z.infer<typeof TodoParamsSchema>;
