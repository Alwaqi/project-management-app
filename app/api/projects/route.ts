import { asc, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { project, projectTargetTask, task } from "@/lib/db/schema";
import {
  canAccessAssignedTarget,
  forbiddenResponse,
  getRequestUser,
  unauthorizedResponse,
} from "@/lib/api/authz";
import {
  groupTargetTasksByProject,
  toProjectDto,
  toProjectWithProgress,
  toTaskDto,
} from "@/lib/api/mappers";
import { databaseUnavailableResponse, handleRouteError } from "@/lib/api/responses";
import { projectCreateSchema } from "@/lib/api/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const currentUser = await getRequestUser(request);
    if (!currentUser) return unauthorizedResponse();

    const [projectRows, targetTaskRows, taskRows] = await Promise.all([
      db.select().from(project).orderBy(desc(project.createdAt)),
      db.select().from(projectTargetTask).orderBy(asc(projectTargetTask.urutan)),
      db.select().from(task),
    ]);
    const tasks = taskRows.map(toTaskDto);
    const visibleTargetTaskRows =
      currentUser.role === "Leader"
        ? targetTaskRows
        : targetTaskRows.filter((targetTask) =>
            canAccessAssignedTarget(targetTask.assignedUserId, currentUser),
          );
    const targetTasksByProject = groupTargetTasksByProject(targetTaskRows);
    const visibleTargetTasksByProject = groupTargetTasksByProject(visibleTargetTaskRows);
    const projects = projectRows
      .filter(
        (item) =>
          currentUser.role === "Leader" ||
          (visibleTargetTasksByProject.get(item.id)?.length ?? 0) > 0,
      )
      .map((item) =>
        toProjectDto(
          item,
          currentUser.role === "Leader"
            ? targetTasksByProject.get(item.id) ?? []
            : visibleTargetTasksByProject.get(item.id) ?? [],
        ),
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
    const currentUser = await getRequestUser(request);
    if (!currentUser) return unauthorizedResponse();
    if (currentUser.role !== "Leader") return forbiddenResponse("Hanya Leader yang bisa membuat proyek");

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
            assignedUserId: item.assignedUserId,
            status: item.status,
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
            assignedUserId: item.assignedUserId,
            status: item.status,
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
  id?: string;
  deskripsi: string;
  mulai?: string | null;
  deadline?: string | null;
  assigned_user_id?: string | null;
  status?: "Belum Mulai" | "Dikerjakan" | "Koreksi" | "Selesai";
}>) {
  const seen = new Set<string>();

  return (details ?? []).flatMap((item) => {
    const detail =
      typeof item === "string"
        ? {
            id: undefined,
            deskripsi: item.trim(),
            assignedUserId: null,
            status: "Belum Mulai" as const,
            mulai: null,
            deadline: null,
          }
        : {
            id: item.id,
            deskripsi: item.deskripsi.trim(),
            assignedUserId: item.assigned_user_id || null,
            status: item.status ?? "Belum Mulai",
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
