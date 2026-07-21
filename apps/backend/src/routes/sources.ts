import { Router } from "express";
import { z } from "zod";
import { getClassificationProgress } from "../repositories/classificationProgress.js";
import { ALLOWED_COMPLEMENT_CORPORA, listSefariaReferenceConnections } from "../repositories/textClassifications.js";
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

const sourceConnectionsQuerySchema = z.object({
  q: z.string().optional(),
  corpus: z.enum(ALLOWED_COMPLEMENT_CORPORA).optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  reviewOutcome: z.enum(["all", "accept", "borderline", "reject", "pending", "failed", "unreviewed"]).optional(),
  limit: z.coerce.number().int().positive().max(10000).default(500)
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

sourcesRouter.get("/connections", async (req, res, next) => {
  try {
    const input = sourceConnectionsQuerySchema.parse(req.query);
    const sources = await listSefariaReferenceConnections({
      query: input.q,
      corpus: input.corpus,
      minConfidence: input.minConfidence,
      reviewOutcome: input.reviewOutcome,
      limit: input.limit
    });

    res.json({
      sources: sources.map((source) => ({
        id: source.id,
        ref: source.ref,
        normalizedRef: source.normalizedRef,
        corpus: source.corpus,
        book: source.book,
        category: source.category,
        url: source.url,
        connectionCount: source._count.textComplements,
        passages: source.textComplements.map((connection) => ({
          id: connection.id,
          paragraphId: connection.paragraphId,
          topic: connection.topic,
          rationale: connection.rationale,
          confidence: connection.confidence,
          rank: connection.rank,
          latestReview: connection.aiReviews[0]
            ? {
                id: connection.aiReviews[0].id,
                provider: connection.aiReviews[0].provider,
                model: connection.aiReviews[0].model,
                promptVersion: connection.aiReviews[0].promptVersion,
                providerRequestId: connection.aiReviews[0].providerRequestId,
                status: connection.aiReviews[0].status,
                verdict: connection.aiReviews[0].verdict,
                score: connection.aiReviews[0].score,
                issueTags: connection.aiReviews[0].issueTags,
                rationale: connection.aiReviews[0].rationale,
                suggestedAction: connection.aiReviews[0].suggestedAction,
                suggestedRef: connection.aiReviews[0].suggestedRef,
                estimatedCostUsd: connection.aiReviews[0].estimatedCostUsd,
                createdAt: connection.aiReviews[0].createdAt,
                completedAt: connection.aiReviews[0].completedAt
              }
            : null,
          generatedBy: connection.classificationRun
            ? {
                provider: connection.classificationRun.provider,
                model: connection.classificationRun.model,
                promptVersion: connection.classificationRun.promptVersion,
                providerRequestId: connection.classificationRun.providerRequestId,
                inputTokens: connection.classificationRun.inputTokens,
                outputTokens: connection.classificationRun.outputTokens,
                totalTokens: connection.classificationRun.totalTokens,
                estimatedCostUsd: connection.classificationRun.estimatedCostUsd,
                createdAt: connection.classificationRun.createdAt,
                completedAt: connection.classificationRun.completedAt
              }
            : null,
          rabbiSacksRef: connection.textUnit.ref,
          rabbiSacksUrl: `https://www.sefaria.org/${connection.textUnit.ref.replaceAll(" ", "_").replaceAll(":", ".")}?lang=bi`,
          text: connection.textUnit.text,
          language: connection.textUnit.language,
          book: {
            id: connection.textUnit.book.id,
            slug: connection.textUnit.book.slug,
            title: connection.textUnit.book.title,
            category: connection.textUnit.book.category
          },
          chapter: connection.textUnit.chapterRef
            ? {
                id: connection.textUnit.chapterRef.id,
                number: connection.textUnit.chapterRef.number,
                ref: connection.textUnit.chapterRef.ref,
                title: connection.textUnit.chapterRef.title
              }
            : null
        }))
      }))
    });
  } catch (error) {
    next(error);
  }
});

sourcesRouter.get("/classification-progress", async (_req, res, next) => {
  try {
    const books = await getClassificationProgress();
    res.json({ books });
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
