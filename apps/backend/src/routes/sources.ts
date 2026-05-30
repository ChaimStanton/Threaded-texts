import { Router } from "express";
import { z } from "zod";
import { createSourceNote, listSourceNotes, serializeSourceNote } from "../repositories/sourceNotes.js";
import { getSefariaText } from "../sefaria/client.js";

const createSourceNoteSchema = z.object({
  ref: z.string().min(1),
  title: z.string().optional(),
  text: z.string().optional(),
  version: z.string().optional(),
  language: z.string().default("en"),
  tags: z.array(z.string()).default([])
});

export const sourcesRouter = Router();

sourcesRouter.get("/", async (_req, res, next) => {
  try {
    const notes = await listSourceNotes();
    res.json({ notes: notes.map(serializeSourceNote) });
  } catch (error) {
    next(error);
  }
});

sourcesRouter.post("/", async (req, res, next) => {
  try {
    const input = createSourceNoteSchema.parse(req.body);
    const note = await createSourceNote(input);
    res.status(201).json({ note: serializeSourceNote(note) });
  } catch (error) {
    next(error);
  }
});

sourcesRouter.get("/sefaria/:ref", async (req, res, next) => {
  try {
    const text = await getSefariaText(req.params.ref);
    res.json({ text });
  } catch (error) {
    next(error);
  }
});
