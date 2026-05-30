import { Router } from "express";
import { z } from "zod";
import { upsertAuthor } from "../repositories/authors.js";
import { listRabbiSacksArticles, upsertRabbiSacksArticle } from "../repositories/rabbiSacksArticles.js";
import { scrapeRabbiSacksArticle } from "../scrapers/rabbiSacks.js";

const scrapeArticleSchema = z.object({
  sourceUrl: z.string().url()
});

export const rabbiSacksRouter = Router();

rabbiSacksRouter.get("/articles", async (_req, res, next) => {
  try {
    const articles = await listRabbiSacksArticles();
    res.json({ articles });
  } catch (error) {
    next(error);
  }
});

rabbiSacksRouter.post("/articles/scrape", async (req, res, next) => {
  try {
    const input = scrapeArticleSchema.parse(req.body);
    const author = await upsertAuthor({
      slug: "rabbi-lord-jonathan-sacks",
      displayName: "Rabbi Lord Jonathan Sacks",
      sortName: "Sacks, Jonathan"
    });
    const scraped = await scrapeRabbiSacksArticle(input.sourceUrl);
    const article = await upsertRabbiSacksArticle({ ...scraped, authorId: author.id });
    res.status(201).json({ article });
  } catch (error) {
    next(error);
  }
});
