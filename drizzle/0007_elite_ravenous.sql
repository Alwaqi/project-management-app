CREATE TYPE "public"."team_type" AS ENUM('Tim Sales', 'Tim SE', 'Tim Admin');--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "team_type" "team_type" DEFAULT 'Tim Sales' NOT NULL;