-- CreateTable
CREATE TABLE "SefariaComplementAiReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "textSefariaComplementId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "prompt" JSONB NOT NULL,
    "request" JSONB NOT NULL,
    "response" JSONB,
    "responseText" TEXT,
    "providerRequestId" TEXT,
    "inputTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "outputTokens" INTEGER,
    "reasoningTokens" INTEGER,
    "totalTokens" INTEGER,
    "estimatedCostUsd" REAL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "verdict" TEXT,
    "score" INTEGER,
    "issueTags" JSONB,
    "rationale" TEXT,
    "suggestedAction" TEXT,
    "suggestedRef" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "SefariaComplementAiReview_textSefariaComplementId_fkey" FOREIGN KEY ("textSefariaComplementId") REFERENCES "TextSefariaComplement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SefariaComplementAiReview_textSefariaComplementId_idx" ON "SefariaComplementAiReview"("textSefariaComplementId");

-- CreateIndex
CREATE INDEX "SefariaComplementAiReview_provider_model_idx" ON "SefariaComplementAiReview"("provider", "model");

-- CreateIndex
CREATE INDEX "SefariaComplementAiReview_promptVersion_status_idx" ON "SefariaComplementAiReview"("promptVersion", "status");

-- CreateIndex
CREATE INDEX "SefariaComplementAiReview_verdict_idx" ON "SefariaComplementAiReview"("verdict");

-- CreateIndex
CREATE INDEX "SefariaComplementAiReview_score_idx" ON "SefariaComplementAiReview"("score");

-- CreateIndex
CREATE INDEX "SefariaComplementAiReview_deletedAt_idx" ON "SefariaComplementAiReview"("deletedAt");
