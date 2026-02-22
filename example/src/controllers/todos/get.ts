import { listTodos } from "../../models/todos.ts";
import { TodoListResponseSchema } from "../../schemas/todos.ts";
import type { ControllerModule } from "../../types.ts";
import { sendJson } from "../../utils/http.ts";

const responseSchema = TodoListResponseSchema;

const controller: ControllerModule = {
  schema: {
    response: responseSchema,
  },
  openapi: {
    summary: "List todos",
    responses: {
      "200": {
        description: "Todos list",
      },
    },
  },
  handler: async ({ context, response }) => {
    const todos = await listTodos(context);
    sendJson(response, 200, responseSchema.parse({ todos }));
  },
};

export default controller;
