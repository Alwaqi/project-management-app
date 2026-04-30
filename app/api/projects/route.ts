import { asc, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { project, projectTargetTask, task } from "@/lib/db/schema";
import {
  groupTargetTasksByProject,
  toProjectDto,
  toProjectWithProgress,
  toTaskDto,
} from "@/lib/api/mappers";
import { databaseUnavailableResponse, handleRouteError } from "@/lib/api/responses";
import { projectCreateSchema } from "@/lib/api/validation";

export const runtime = "nodejs";

export async function GET() {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const [projectRows, targetTaskRows, taskRows] = await Promise.all([
      db.select().from(project).orderBy(desc(project.createdAt)),
      db.select().from(projectTargetTask).orderBy(asc(projectTargetTask.urutan)),
      db.select().from(task),
    ]);
    const tasks = taskRows.map(toTaskDto);
    const targetTasksByProject = groupTargetTasksByProject(targetTaskRows);
    const projects = projectRows.map((item) =>
      toProjectDto(item, targetTasksByProject.get(item.id) ?? []),
    );

    return NextResponse.json({
      data: projects.map((item) => toProjectWithProgress(item, tasks)),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const payload = projectCreateSchema.parse(await request.json());
    const targetItems = normalizeTargetDetails(payload.target_detail_tugas);
    const projectDeadline = getProjectDeadline(targetItems) ?? payload.deadline ?? null;
    const createdProject = await db.transaction(async (tx) => {
      const [newProject] = await tx.insert(project).values({
        id: crypto.randomUUID(),
        namaProyek: payload.nama_proyek,
        status: payload.status,
        targetTugas: targetItems.length || payload.target_tugas,
        deadline: projectDeadline,
      }).returning();

      if (targetItems.length > 0) {
        await tx.insert(projectTargetTask).values(
          targetItems.map((item, index) => ({
            id: crypto.randomUUID(),
            projectId: newProject.id,
            deskripsi: item.deskripsi,
            mulai: item.mulai,
            deadline: item.deadline,
            urutan: index + 1,
          })),
        );
      }

      return newProject;
    });

    return NextResponse.json(
      {
        data: toProjectDto(
          createdProject,
          targetItems.map((item, index) => ({
            id: "",
            projectId: createdProject.id,
            deskripsi: item.deskripsi,
            mulai: item.mulai,
            deadline: item.deadline,
            urutan: index + 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

function normalizeTargetDetails(details?: Array<string | {
  deskripsi: string;
  mulai?: string | null;
  deadline?: string | null;
}>) {
  const seen = new Set<string>();

  return (details ?? []).flatMap((item) => {
    const detail =
      typeof item === "string"
        ? { deskripsi: item.trim(), mulai: null, deadline: null }
        : {
            deskripsi: item.deskripsi.trim(),
            mulai: item.mulai || null,
            deadline: item.deadline || null,
          };

    if (!detail.deskripsi || seen.has(detail.deskripsi)) {
      return [];
    }

    seen.add(detail.deskripsi);
    return [detail];
  });
}

function getProjectDeadline(
  details: Array<{
    deadline: string | null;
  }>,
) {
  return details
    .map((item) => item.deadline)
    .filter((deadline): deadline is string => Boolean(deadline))
    .sort()
    .at(-1) ?? null;
}
