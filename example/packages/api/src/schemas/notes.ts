import { z } from "zod/v4";

export const ErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
});

export const NoteIdentifierSchema = z.object({
  noteId: z.uuid({ message: "Note identifier must be a valid UUID" }),
});

export const CreateNoteRequestSchema = z.object({
  title: z.string().min(1, { message: "Title is required" }).max(120, {
    message: "Title must be 120 characters or less",
  }),
  content: z.string().min(1, { message: "Content cannot be empty" }),
});

export const NoteSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const NoteListSchema = z.object({
  notes: NoteSchema.array(),
});

export type CreateNoteRequest = z.infer<typeof CreateNoteRequestSchema>;
export type Note = z.infer<typeof NoteSchema>;
