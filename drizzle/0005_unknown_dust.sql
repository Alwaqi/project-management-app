CREATE TYPE "public"."target_task_status" AS ENUM('Belum Mulai', 'Dikerjakan', 'Selesai');--> statement-breakpoint
ALTER TABLE "project_target_task" ADD COLUMN "assigned_user_id" text;--> statement-breakpoint
ALTER TABLE "project_target_task" ADD COLUMN "status" "target_task_status" DEFAULT 'Belum Mulai' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_target_task" ADD CONSTRAINT "project_target_task_assigned_user_id_user_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;