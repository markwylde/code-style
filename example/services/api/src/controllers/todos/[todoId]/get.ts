import { getTodoById } from "../../../models/todos.ts";
import { TodoParamsSchema, TodoSchema } from "../../../schemas/todos.ts";
import type { ControllerModule } from "../../../types.ts";
import { sendJson } from "../../../utils/http.ts";

const responseSchema = TodoSchema;

const controller: ControllerModule = {
  schema: {
    params: TodoParamsSchema,
    response: responseSchema,
  },
  openapi: {
    summary: "Get todo by ID",
    responses: {
      "200": {
        description: "Todo found",
      },
      "404": {
        description: "Todo not found",
      },
    },
  },
  handler: async ({ context, response, params }) => {
    const parsed = TodoParamsSchema.parse(params);
    const todo = await getTodoById(context, parsed.todoId);
    sendJson(response, 200, responseSchema.parse(todo));
  },
};

export default controller;
