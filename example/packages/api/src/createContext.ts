import { randomUUID } from "node:crypto";
import { runMigrations } from "./db/migrate.js";
import type { NoteRecord } from "./db/schema.js";
import type { AppContext, Config, Logger, NotesRepository } from "./types.js";

type CreateContextOptions = {
  config: Config;
  logger?: Logger;
};

function createConsoleLogger(): Logger {
  return {
    info(message, metadata) {
      console.info(message, metadata ?? {});
    },
    error(message, metadata) {
      console.error(message, metadata ?? {});
    },
    warn(message, metadata) {
      console.warn(message, metadata ?? {});
    },
  };
}

function createInMemoryNotesRepository(): NotesRepository {
  const notes = new Map<string, NoteRecord>();

  return {
    async listNotes() {
      return Array.from(notes.values());
    },
    async createNote(input) {
      const now = new Date();
      const record: NoteRecord = {
        id: randomUUID(),
        title: input.title,
        content: input.content,
        createdAt: now,
        updatedAt: now,
      };

      notes.set(record.id, record);
      return record;
    },
    async getNoteById(noteId) {
      return notes.get(noteId) ?? null;
    },
  };
}

export async function createContext(
  options: CreateContextOptions,
): Promise<AppContext> {
  await runMigrations();

  const logger = options.logger ?? createConsoleLogger();

  return {
    config: options.config,
    logger,
    notesRepository: createInMemoryNotesRepository(),
  };
}
