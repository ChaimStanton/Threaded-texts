import { Router } from "express";
import { z } from "zod";
import { listBooks, listChapters, listTextUnits, upsertBook, upsertChapter, upsertTextUnit } from "../repositories/texts.js";

const upsertBookSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  heTitle: z.string().optional(),
  category: z.string().optional(),
  authorId: z.string().optional()
});

const upsertTextUnitSchema = z.object({
  paragraphId: z.string().min(1),
  bookId: z.string().min(1),
  chapterId: z.string().optional(),
  chapter: z.coerce.number().int().positive(),
  verse: z.coerce.number().int().positive().optional(),
  paragraph: z.coerce.number().int().positive(),
  ref: z.string().min(1),
  text: z.string().min(1),
  language: z.string().default("en"),
  version: z.string().optional()
});

const upsertChapterSchema = z.object({
  bookId: z.string().min(1),
  number: z.coerce.number().int().positive(),
  ref: z.string().min(1),
  title: z.string().optional(),
  heTitle: z.string().optional(),
  isNonMainText: z.boolean().optional()
});

export const textsRouter = Router();

textsRouter.get("/books", async (_req, res, next) => {
  try {
    const books = await listBooks();
    res.json({ books });
  } catch (error) {
    next(error);
  }
});

textsRouter.post("/books", async (req, res, next) => {
  try {
    const input = upsertBookSchema.parse(req.body);
    const book = await upsertBook(input);
    res.status(201).json({ book });
  } catch (error) {
    next(error);
  }
});

textsRouter.get("/books/:bookId/chapters", async (req, res, next) => {
  try {
    const chapters = await listChapters(req.params.bookId);
    res.json({ chapters });
  } catch (error) {
    next(error);
  }
});

textsRouter.get("/books/:bookId/units", async (req, res, next) => {
  try {
    const units = await listTextUnits(req.params.bookId);
    res.json({ units });
  } catch (error) {
    next(error);
  }
});

textsRouter.post("/chapters", async (req, res, next) => {
  try {
    const input = upsertChapterSchema.parse(req.body);
    const chapter = await upsertChapter(input);
    res.status(201).json({ chapter });
  } catch (error) {
    next(error);
  }
});

textsRouter.post("/units", async (req, res, next) => {
  try {
    const input = upsertTextUnitSchema.parse(req.body);
    const unit = await upsertTextUnit(input);
    res.status(201).json({ unit });
  } catch (error) {
    next(error);
  }
});
