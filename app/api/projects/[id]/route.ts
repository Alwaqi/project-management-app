import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { project, projectTargetTask } from "@/lib/db/schema";
import { toProjectDto } from "@/lib/api/mappers";
import { databaseUnavailableResponse, handleRouteError } from "@/lib/api/responses";
import { projectUpdateSchema } from "@/lib/api/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const { id } = await context.params;
    const [projectRow, targetTasks] = await Promise.all([
      db.select().from(project).where(eq(project.id, id)).limit(1),
      db
        .select()
        .from(projectTargetTask)
        .where(eq(projectTargetTask.projectId, id))
        .orderBy(asc(projectTargetTask.urutan)),
    ]);

    if (!projectRow[0]) {
      return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
    }

    return NextResponse.json({
      data: toProjectDto(projectRow[0], targetTasks),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const { id } = await context.params;
    const payload = projectUpdateSchema.parse(await request.json());
    const targetItems =
      "target_detail_tugas" in payload
        ? normalizeTargetDetails(payload.target_detail_tugas)
        : undefined;
    const projectDeadline =
      targetItems ? getProjectDeadline(targetItems) : payload.deadline ?? undefined;
    const updatedProject = await db.transaction(async (tx) => {
      const [projectRow] = await tx
        .update(project)
        .set({
          ...(payload.nama_proyek ? { namaProyek: payload.nama_proyek } : {}),
          ...(payload.status ? { status: payload.status } : {}),
          ...(payload.target_tugas || targetItems
            ? { targetTugas: targetItems?.length || payload.target_tugas || 1 }
            : {}),
          ...(projectDeadline !== undefined ? { deadline: projectDeadline } : {}),
          updatedAt: new Date(),
        })
        .where(eq(project.id, id))
        .returning();

      if (projectRow && targetItems) {
        await tx.delete(projectTargetTask).where(eq(projectTargetTask.projectId, id));

        if (targetItems.length > 0) {
          await tx.insert(projectTargetTask).values(
            targetItems.map((item, index) => ({
              id: crypto.randomUUID(),
              projectId: id,
              deskripsi: item.deskripsi,
              mulai: item.mulai,
              deadline: item.deadline,
              urutan: index + 1,
            })),
          );
        }
      }

      return projectRow;
    });

    if (!updatedProject) {
      return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
    }

    return NextResponse.json({
      data: toProjectDto(
        updatedProject,
        (targetItems ?? []).map((item, index) => ({
          id: "",
          projectId: updatedProject.id,
          deskripsi: item.deskripsi,
          mulai: item.mulai,
          deadline: item.deadline,
          urutan: index + 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      ),
    });
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
