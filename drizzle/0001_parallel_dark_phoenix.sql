CREATE TABLE "project_collaborator_team" (
	"project_id" varchar(255) NOT NULL,
	"team_type" "team_type" NOT NULL,
	CONSTRAINT "project_collaborator_team_project_id_team_type_pk" PRIMARY KEY("project_id","team_type")
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "owner_team" "team_type" DEFAULT 'Tim Admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_collaborator_team" ADD CONSTRAINT "project_collaborator_team_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pct_team_idx" ON "project_collaborator_team" USING btree ("team_type");--> statement-breakpoint
UPDATE "project" p
SET "owner_team" = COALESCE(
	(SELECT u.team_type
	 FROM "project_target_task" t
	 JOIN "user" u ON u.id = t.assigned_user_id
	 WHERE t.project_id = p.id
	 GROUP BY u.team_type
	 ORDER BY COUNT(*) DESC
	 LIMIT 1),
	'Tim Admin'::"team_type"
);--> statement-breakpoint
INSERT INTO "project_collaborator_team" ("project_id", "team_type")
SELECT DISTINCT t.project_id, u.team_type
FROM "project_target_task" t
JOIN "user" u ON u.id = t.assigned_user_id
JOIN "project" p ON p.id = t.project_id
WHERE u.team_type <> p.owner_team
ON CONFLICT DO NOTHING;
