CREATE INDEX "LlmTextClassification_paragraphId_promptVersion_provider_model_status_idx"
ON "LlmTextClassification"("paragraphId", "promptVersion", "provider", "model", "status");

CREATE UNIQUE INDEX "LlmTextClassification_active_completed_once_key"
ON "LlmTextClassification"("paragraphId", "promptVersion", "provider", "model")
WHERE "deletedAt" IS NULL AND "status" = 'completed';

CREATE UNIQUE INDEX "LlmTextClassification_active_pending_once_key"
ON "LlmTextClassification"("paragraphId", "promptVersion", "provider", "model")
WHERE "deletedAt" IS NULL AND "status" = 'pending';
