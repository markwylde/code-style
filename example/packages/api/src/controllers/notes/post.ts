import { z } from "zod/v4";
import { createNotesModel } from "../../models/notes.js";
import { CreateNoteRequestSchema, NoteSchema } from "../../schemas/notes.js";
import type {
  ControllerDefinition,
  ControllerSchema,
  Handler,
} from "../../types.js";
import { getBodyFromRequest, sendJson } from "../../utils/http.js";

const ParamsSchema = z.object({});

const BodyDefinition = {
  contentType: "application/json" as const,
  schema: CreateNoteRequestSchema,
} as const;

export const schema = {
  method: "POST",
  path: "/notes",
  tags: ["Notes"] as const,
  summary: "Create a new note",
  params: ParamsSchema,
  body: BodyDefinition,
  responses: {
    201: {
      description: "Note created",
      content: {
        "application/json": {
          schema: NoteSchema,
        },
      },
    },
  },
} as const satisfies ControllerSchema<
  typeof ParamsSchema,
  undefined,
  typeof BodyDefinition
>;

type Schema = typeof schema;

export const handler: Handler<Schema> = async ({
  context,
  request,
  response,
}) => {
  const body = await getBodyFromRequest(request, schema);
  const notesModel = createNotesModel(context);
  const note = await notesModel.create(body);
  sendJson(response, 201, note);
};

export const controller: ControllerDefinition<Schema> = {
  schema,
  handler,
};
