ALTER TABLE "models" ADD COLUMN "hidden_at" timestamp;--> statement-breakpoint
ALTER TABLE "models" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
-- Delist two models at their provider's request. This HIDES them: the rows and
-- every vote they earned stay exactly where they are, they just stop being
-- published and stop being served in battles. Reversible with
-- `PATCH /api/admin/models/{id} {"hidden": false}` — no migration needed.
-- (A no-op on a fresh database, where the model rows don't exist until the
-- catalog seed runs; the same is true of every other model flag.)
UPDATE "models"
SET "hidden_at" = now(), "hidden_reason" = 'Delisted at the provider''s request.'
WHERE "id" IN ('luck-dolphin-turbo', 'nls-pre-v1') AND "hidden_at" IS NULL;
