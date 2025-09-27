import { z } from "zod/v4";

export const NoteRecord = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(120),
  content: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type NoteRecord = z.infer<typeof NoteRecord>;
