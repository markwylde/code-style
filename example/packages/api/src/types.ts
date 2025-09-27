import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { z } from "zod/v4";
import type { NoteRecord } from "./db/schema.js";

type ZodObjectSchema = z.ZodObject<Record<string, z.ZodTypeAny>>;

export type Config = {
  host: string;
  port: number;
};

export type Logger = {
  info: (message: string, metadata?: Record<string, unknown>) => void;
  error: (message: string, metadata?: Record<string, unknown>) => void;
  warn: (message: string, metadata?: Record<string, unknown>) => void;
};

export type CreateNoteInput = {
  title: string;
  content: string;
};

export type NotesRepository = {
  listNotes: () => Promise<NoteRecord[]>;
  createNote: (input: CreateNoteInput) => Promise<NoteRecord>;
  getNoteById: (noteId: string) => Promise<NoteRecord | null>;
};

export type AppContext = {
  config: Config;
  logger: Logger;
  notesRepository: NotesRepository;
};

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type JsonResponseContent = {
  schema: z.ZodTypeAny;
};

export type ResponseDefinition = {
  description: string;
  content?: {
    "application/json"?: JsonResponseContent;
  };
};

export type ControllerSchema<
  TParams extends ZodObjectSchema | undefined = ZodObjectSchema | undefined,
  TQuery extends ZodObjectSchema | undefined = ZodObjectSchema | undefined,
  TBody extends { contentType: string; schema: z.ZodTypeAny } | undefined =
    | { contentType: string; schema: z.ZodTypeAny }
    | undefined,
> = {
  method: HttpMethod;
  path: string;
  summary?: string;
  description?: string;
  tags?: readonly string[];
  params?: TParams;
  query?: TQuery;
  body?: TBody;
  responses: Record<number, ResponseDefinition>;
};

type ParamsSchema<TSchema extends ControllerSchema> =
  TSchema extends ControllerSchema<infer TParams, infer _TQuery, infer _TBody>
    ? TParams
    : undefined;

type QuerySchema<TSchema extends ControllerSchema> =
  TSchema extends ControllerSchema<infer _TParams, infer TQuery, infer _TBody>
    ? TQuery
    : undefined;

type InferParams<TSchema extends ControllerSchema> =
  ParamsSchema<TSchema> extends ZodObjectSchema
    ? z.infer<ParamsSchema<TSchema>>
    : Record<string, never>;

type InferQuery<TSchema extends ControllerSchema> =
  QuerySchema<TSchema> extends ZodObjectSchema
    ? z.infer<QuerySchema<TSchema>>
    : Record<string, never>;

export type HandlerArguments<TSchema extends ControllerSchema> = {
  context: AppContext;
  request: IncomingMessage;
  response: ServerResponse;
  params: InferParams<TSchema>;
  query: InferQuery<TSchema>;
};

export type Handler<TSchema extends ControllerSchema> = (
  args: HandlerArguments<TSchema>,
) => void | Promise<void>;

export type ControllerDefinition<
  TSchema extends ControllerSchema = ControllerSchema,
> = {
  schema: TSchema;
  handler: Handler<TSchema>;
};

export type Route<TSchema extends ControllerSchema = ControllerSchema> = {
  method: HttpMethod;
  pattern: URLPattern;
  controller: ControllerDefinition<TSchema>;
};

export type ServerLifecycle = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  getContext: () => AppContext;
  getServers: () => { http: Server | null };
};
