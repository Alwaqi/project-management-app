import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { project, projectTargetTask } from "@/lib/db/schema";
import {
  canAccessAssignedTarget,
  forbiddenResponse,
  getRequestUser,
  unauthorizedResponse,
} from "@/lib/api/authz";
import { sendTargetAssignmentEmails } from "@/lib/api/assignment-notifications";
import { toProjectDto } from "@/lib/api/mappers";
import { databaseUnavailableResponse, handleRouteError } from "@/lib/api/responses";
import { projectUpdateSchema } from "@/lib/api/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const currentUser = await getRequestUser(request);
    if (!currentUser) return unauthorizedResponse();

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

    const visibleTargetTasks =
      currentUser.role === "Leader"
        ? targetTasks
        : targetTasks.filter((targetTask) =>
            canAccessAssignedTarget(targetTask.assignedUserId, currentUser),
          );

    if (currentUser.role !== "Leader" && visibleTargetTasks.length === 0) {
      return forbiddenResponse("Proyek ini tidak ditugaskan ke akun ini");
    }

    return NextResponse.json({
      data: toProjectDto(projectRow[0], visibleTargetTasks),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const currentUser = await getRequestUser(request);
    if (!currentUser) return unauthorizedResponse();
    if (currentUser.role !== "Leader") return forbiddenResponse("Hanya Leader yang bisa mengubah proyek");

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
        const existingTargetTasks = await tx
          .select()
          .from(projectTargetTask)
          .where(eq(projectTargetTask.projectId, id));
        const existingTargetsById = new Map(
          existingTargetTasks.map((targetTask) => [targetTask.id, targetTask]),
        );
        const existingTargetIds = new Set(existingTargetTasks.map((targetTask) => targetTask.id));
        const submittedExistingIds = new Set(
          targetItems
            .map((item) => item.id)
            .filter((targetId): targetId is string => Boolean(targetId && existingTargetIds.has(targetId))),
        );

        const assignmentTargets = targetItems
          .filter((item) => {
            if (!item.assignedUserId) {
              return false;
            }

            const existingTarget = item.id ? existingTargetsById.get(item.id) : undefined;
            return !existingTarget || existingTarget.assignedUserId !== item.assignedUserId;
          })
          .map((item) => ({
            assignedUserId: item.assignedUserId,
            deskripsi: item.deskripsi,
            mulai: item.mulai,
            deadline: item.deadline,
          }));

        await Promise.all(
          existingTargetTasks
            .filter((targetTask) => !submittedExistingIds.has(targetTask.id))
            .map((targetTask) =>
              tx.delete(projectTargetTask).where(eq(projectTargetTask.id, targetTask.id)),
            ),
        );

        await Promise.all(
          targetItems.map((item, index) => {
            if (item.id && existingTargetIds.has(item.id)) {
              return tx
                .update(projectTargetTask)
                .set({
                  deskripsi: item.deskripsi,
                  assignedUserId: item.assignedUserId,
                  status: item.status,
                  mulai: item.mulai,
                  deadline: item.deadline,
                  urutan: index + 1,
                  updatedAt: new Date(),
                })
                .where(eq(projectTargetTask.id, item.id));
            }

            return tx.insert(projectTargetTask).values({
              id: item.id ?? crypto.randomUUID(),
              projectId: id,
              deskripsi: item.deskripsi,
              assignedUserId: item.assignedUserId,
              status: item.status,
              mulai: item.mulai,
              deadline: item.deadline,
              urutan: index + 1,
            });
          }),
        );

        return {
          project: projectRow,
          assignmentTargets,
        };
      }

      return {
        project: projectRow,
        assignmentTargets: [],
      };
    });

    if (!updatedProject.project) {
      return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
    }

    await sendTargetAssignmentEmails({
      projectName: updatedProject.project.namaProyek,
      targets: updatedProject.assignmentTargets,
      assignedBy: currentUser.nama,
    });

    const targetTasksForResponse = await db
      .select()
      .from(projectTargetTask)
      .where(eq(projectTargetTask.projectId, id))
      .orderBy(asc(projectTargetTask.urutan));

    return NextResponse.json({
      data: toProjectDto(updatedProject.project, targetTasksForResponse),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const currentUser = await getRequestUser(request);
    if (!currentUser) return unauthorizedResponse();
    if (currentUser.role !== "Leader") return forbiddenResponse("Hanya Leader yang bisa menghapus proyek");

    const { id } = await context.params;
    const [deletedProject] = await db.delete(project).where(eq(project.id, id)).returning();

    if (!deletedProject) {
      return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        id: deletedProject.id,
      },
    });
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
