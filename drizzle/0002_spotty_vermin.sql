CREATE TABLE "project_target_task" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"deskripsi" text NOT NULL,
	"urutan" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_target_task" ADD CONSTRAINT "project_target_task_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;