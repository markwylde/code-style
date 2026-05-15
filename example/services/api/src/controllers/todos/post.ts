import { createTodo } from "../../models/todos.ts";
import { CreateTodoSchema, TodoSchema } from "../../schemas/todos.ts";
import type { ControllerModule } from "../../types.ts";
import { getBodyFromRequest } from "../../utils/getBodyFromRequest.ts";
import { sendJson } from "../../utils/http.ts";

const responseSchema = TodoSchema;

const controller: ControllerModule = {
  schema: {
    body: CreateTodoSchema,
    response: responseSchema,
  },
  openapi: {
    summary: "Create todo",
    requestBody: {
      required: true,
    },
    responses: {
      "201": {
        description: "Created todo",
      },
      "409": {
        description: "Duplicate title",
      },
    },
  },
  handler: async ({ context, request, response }) => {
    const body = await getBodyFromRequest(context, request, "json");
    const todo = await createTodo(context, CreateTodoSchema.parse(body));
    sendJson(response, 201, responseSchema.parse(todo));
  },
};

export default controller;
