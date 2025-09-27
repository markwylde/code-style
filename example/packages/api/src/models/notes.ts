import type { NoteRecord } from "../db/schema.js";
import type { CreateNoteRequest, Note } from "../schemas/notes.js";
import type { AppContext } from "../types.js";

function mapRecordToNote(note: NoteRecord): Note {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

export function createNotesModel(context: Pick<AppContext, "notesRepository">) {
  const { notesRepository } = context;

  return {
    async list(): Promise<Note[]> {
      const records = await notesRepository.listNotes();
      return records.map(mapRecordToNote);
    },

    async create(input: CreateNoteRequest): Promise<Note> {
      const record = await notesRepository.createNote(input);
      return mapRecordToNote(record);
    },

    async getById(noteId: string): Promise<Note | null> {
      const record = await notesRepository.getNoteById(noteId);
      return record ? mapRecordToNote(record) : null;
    },
  };
}
