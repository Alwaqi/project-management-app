import { asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  project,
  projectCollaboratorTeam,
  projectTargetTask,
  user,
} from "@/lib/db/schema";
import {
  canAccessAssignedTarget,
  canLeaderAccessProject,
  forbiddenResponse,
  getProjectAccessContext,
  getRequestUser,
  unauthorizedResponse,
} from "@/lib/api/authz";
import { sendTargetAssignmentEmails } from "@/lib/api/assignment-notifications";
import { toProjectDto } from "@/lib/api/mappers";
import { databaseUnavailableResponse, handleRouteError } from "@/lib/api/responses";
import { projectUpdateSchema } from "@/lib/api/validation";
import type { TeamType } from "@/lib/domain";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

async function getCollaboratorTeams(projectId: string): Promise<TeamType[]> {
  const rows = await db
    .select({ teamType: projectCollaboratorTeam.teamType })
    .from(projectCollaboratorTeam)
    .where(eq(projectCollaboratorTeam.projectId, projectId));
  return rows.map((row) => row.teamType);
}

export async function GET(request: Request, context: RouteContext) {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const currentUser = await getRequestUser(request);
    if (!currentUser) return unauthorizedResponse();

    const { id } = await context.params;
    const accessCtx = await getProjectAccessContext(id);
    if (!accessCtx) {
      return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
    }

    if (
      currentUser.role === "Leader" &&
      !canLeaderAccessProject(accessCtx.ownerTeam, accessCtx.collaboratorTeams, currentUser)
    ) {
      return forbiddenResponse("Proyek ini bukan milik tim Anda");
    }

    const targetTasks = await db
      .select()
      .from(projectTargetTask)
      .where(eq(projectTargetTask.projectId, id))
      .orderBy(asc(projectTargetTask.urutan));

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
      data: toProjectDto(accessCtx.project, visibleTargetTasks, accessCtx.collaboratorTeams),
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
    const accessCtx = await getProjectAccessContext(id);
    if (!accessCtx) {
      return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
    }
    if (!canLeaderAccessProject(accessCtx.ownerTeam, accessCtx.collaboratorTeams, currentUser)) {
      return forbiddenResponse("Proyek ini bukan milik tim Anda");
    }

    const payload = projectUpdateSchema.parse(await request.json());
    const targetItems =
      "target_detail_tugas" in payload
        ? normalizeTargetDetails(payload.target_detail_tugas)
        : undefined;
    const projectDeadline =
      targetItems ? getProjectDeadline(targetItems) : payload.deadline ?? undefined;
    const requestedCollaborators =
      payload.collaborator_teams !== undefined
        ? Array.from(
            new Set(
              payload.collaborator_teams.filter((team) => team !== accessCtx.ownerTeam),
            ),
          )
        : undefined;

    if (targetItems && targetItems.length > 0) {
      const assignedUserIds = targetItems
        .map((item) => item.assignedUserId)
        .filter((value): value is string => Boolean(value));

      if (assignedUserIds.length > 0) {
        const effectiveCollaborators = requestedCollaborators ?? accessCtx.collaboratorTeams;
        const allowedTeams = [accessCtx.ownerTeam, ...effectiveCollaborators];
        const userRows = await db
          .select({ id: user.id, teamType: user.teamType })
          .from(user)
          .where(inArray(user.id, assignedUserIds));
        const invalid = userRows.find((row) => !allowedTeams.includes(row.teamType));
        if (invalid) {
          return NextResponse.json(
            {
              error: "Ada user yang ditugaskan tidak berasal dari tim owner atau collaborator.",
            },
            { status: 400 },
          );
        }
      }
    }

    const updatedProject = await db.transaction(async (tx) => {
      await tx
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
        .where(eq(project.id, id));

      const [projectRow] = await tx
        .select()
        .from(project)
        .where(eq(project.id, id))
        .limit(1);

      if (requestedCollaborators !== undefined) {
        await tx
          .delete(projectCollaboratorTeam)
          .where(eq(projectCollaboratorTeam.projectId, id));
        if (requestedCollaborators.length > 0) {
          await tx.insert(projectCollaboratorTeam).values(
            requestedCollaborators.map((teamType) => ({
              projectId: id,
              teamType,
            })),
          );
        }
      }

      let assignmentTargets: Array<{
        assignedUserId: string | null;
        deskripsi: string;
        mulai: string | null;
        deadline: string | null;
      }> = [];

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

        assignmentTargets = targetItems
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
      }

      return {
        project: projectRow,
        assignmentTargets,
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
    const collaboratorTeams = await getCollaboratorTeams(id);

    return NextResponse.json({
      data: toProjectDto(updatedProject.project, targetTasksForResponse, collaboratorTeams),
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
    const accessCtx = await getProjectAccessContext(id);
    if (!accessCtx) {
      return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
    }
    if (accessCtx.ownerTeam !== currentUser.team_type) {
      return forbiddenResponse("Hanya Leader tim owner yang bisa menghapus proyek ini");
    }

    await db.delete(project).where(eq(project.id, id));

    return NextResponse.json({
      data: {
        id,
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
