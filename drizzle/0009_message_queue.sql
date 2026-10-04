-- File d'envoi des messages automatiques (étape 9).
ALTER TYPE "public"."message_status" ADD VALUE 'skipped';--> statement-breakpoint
DROP INDEX "message_log_once_per_appointment_key";--> statement-breakpoint
ALTER TABLE "message_log" ALTER COLUMN "recipient" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "message_log" ADD COLUMN "data" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "message_log" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "message_log" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "message_log" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "message_log_queue_idx" ON "message_log" USING btree ("next_attempt_at") WHERE "message_log"."status" = 'queued';--> statement-breakpoint
CREATE UNIQUE INDEX "message_log_dedupe_key" ON "message_log" USING btree ("dedupe_key");