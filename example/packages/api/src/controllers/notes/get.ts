import { z } from "zod/v4";
import { createNotesModel } from "../../models/notes.js";
import { NoteListSchema } from "../../schemas/notes.js";
import type {
  ControllerDefinition,
  ControllerSchema,
  Handler,
} from "../../types.js";
import { sendJson } from "../../utils/http.js";

const ParamsSchema = z.object({});

export const schema = {
  method: "GET",
  path: "/notes",
  tags: ["Notes"] as const,
  summary: "List notes",
  params: ParamsSchema,
  responses: {
    200: {
      description: "Collection of notes",
      content: {
        "application/json": {
          schema: NoteListSchema,
        },
      },
    },
  },
} as const satisfies ControllerSchema<typeof ParamsSchema>;

type Schema = typeof schema;

export const handler: Handler<Schema> = async ({ context, response }) => {
  const notesModel = createNotesModel(context);
  const notes = await notesModel.list();
  sendJson(response, 200, { notes });
};

export const controller: ControllerDefinition<Schema> = {
  schema,
  handler,
};
