import { deleteTodo } from "../../../models/todos.ts";
import { TodoParamsSchema } from "../../../schemas/todos.ts";
import type { ControllerModule } from "../../../types.ts";

const controller: ControllerModule = {
  schema: {
    params: TodoParamsSchema,
  },
  openapi: {
    summary: "Delete todo",
    responses: {
      "204": {
        description: "Todo deleted",
      },
      "404": {
        description: "Todo not found",
      },
    },
  },
  handler: async ({ context, response, params }) => {
    const parsed = TodoParamsSchema.parse(params);
    await deleteTodo(context, parsed.todoId);
    response.writeHead(204);
    response.end();
  },
};

export default controller;
