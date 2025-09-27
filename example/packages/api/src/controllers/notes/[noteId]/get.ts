import { createNotesModel } from "../../../models/notes.js";
import {
  ErrorSchema,
  NoteIdentifierSchema,
  NoteSchema,
} from "../../../schemas/notes.js";
import type {
  ControllerDefinition,
  ControllerSchema,
  Handler,
} from "../../../types.js";
import { sendJson } from "../../../utils/http.js";

export const schema = {
  method: "GET",
  path: "/notes/{noteId}",
  tags: ["Notes"] as const,
  summary: "Get note by identifier",
  params: NoteIdentifierSchema,
  responses: {
    200: {
      description: "Note found",
      content: {
        "application/json": {
          schema: NoteSchema,
        },
      },
    },
    404: {
      description: "Note missing",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
} as const satisfies ControllerSchema<typeof NoteIdentifierSchema>;

type Schema = typeof schema;

export const handler: Handler<Schema> = async ({
  context,
  response,
  params,
}) => {
  const notesModel = createNotesModel(context);
  const note = await notesModel.getById(params.noteId);

  if (!note) {
    sendJson(response, 404, {
      error: "Note not found",
      code: "NOTE_NOT_FOUND",
    });
    return;
  }

  sendJson(response, 200, note);
};

export const controller: ControllerDefinition<Schema> = {
  schema,
  handler,
};
