CREATE TYPE "public"."project_category" AS ENUM('Training', 'Eksplorasi', 'Produksi Produk', 'Workshop', 'Sertifikasi');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client" (
  "id" varchar(255) PRIMARY KEY NOT NULL,
  "nama" varchar(255) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "client_nama_idx" ON "client" ("nama");--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "category" "project_category";--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "client_id" varchar(255);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project" ADD CONSTRAINT "project_client_id_client_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_speaker" (
  "project_id" varchar(255) NOT NULL,
  "user_id" varchar(255) NOT NULL,
  CONSTRAINT "project_speaker_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_speaker_user_idx" ON "project_speaker" ("user_id");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_speaker" ADD CONSTRAINT "project_speaker_project_id_project_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_speaker" ADD CONSTRAINT "project_speaker_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
INSERT INTO "client" ("id", "nama") VALUES
  (gen_random_uuid()::text, 'SDK'),
  (gen_random_uuid()::text, 'Zenith Academy'),
  (gen_random_uuid()::text, 'LSP IDATI')
ON CONFLICT ("nama") DO NOTHING;
