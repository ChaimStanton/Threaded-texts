import { Router } from "express";
import { z } from "zod";
import { listAuthors, upsertAuthor } from "../repositories/authors.js";

const upsertAuthorSchema = z.object({
  slug: z.string().min(1),
  displayName: z.string().min(1),
  sortName: z.string().optional(),
  bio: z.string().optional()
});

export const authorsRouter = Router();

authorsRouter.get("/", async (_req, res, next) => {
  try {
    const authors = await listAuthors();
    res.json({ authors });
  } catch (error) {
    next(error);
  }
});

authorsRouter.post("/", async (req, res, next) => {
  try {
    const input = upsertAuthorSchema.parse(req.body);
    const author = await upsertAuthor(input);
    res.status(201).json({ author });
  } catch (error) {
    next(error);
  }
});
