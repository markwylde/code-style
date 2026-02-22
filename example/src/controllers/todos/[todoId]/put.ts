import { updateTodo } from "../../../models/todos.ts";
import {
  TodoParamsSchema,
  TodoSchema,
  UpdateTodoSchema,
} from "../../../schemas/todos.ts";
import type { ControllerModule } from "../../../types.ts";
import { getBodyFromRequest } from "../../../utils/getBodyFromRequest.ts";
import { sendJson } from "../../../utils/http.ts";

const responseSchema = TodoSchema;

const controller: ControllerModule = {
  schema: {
    params: TodoParamsSchema,
    body: UpdateTodoSchema,
    response: responseSchema,
  },
  openapi: {
    summary: "Update todo",
    requestBody: {
      required: true,
    },
    responses: {
      "200": {
        description: "Todo updated",
      },
      "404": {
        description: "Todo not found",
      },
      "409": {
        description: "Duplicate title",
      },
    },
  },
  handler: async ({ context, request, response, params }) => {
    const parsedParams = TodoParamsSchema.parse(params);
    const body = await getBodyFromRequest(context, request, "json");
    const parsedBody = UpdateTodoSchema.parse(body);
    const todo = await updateTodo(context, parsedParams.todoId, parsedBody);
    sendJson(response, 200, responseSchema.parse(todo));
  },
};

export default controller;
