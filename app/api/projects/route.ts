import { asc, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  project,
  projectCollaboratorTeam,
  projectTargetTask,
  task,
  user,
} from "@/lib/db/schema";
import {
  forbiddenResponse,
  getRequestUser,
  unauthorizedResponse,
} from "@/lib/api/authz";
import {
  groupCollaboratorTeamsByProject,
  groupTargetTasksByProject,
  toProjectDto,
  toProjectWithProgress,
  toTaskDto,
} from "@/lib/api/mappers";
import { databaseUnavailableResponse, handleRouteError } from "@/lib/api/responses";
import { sendTargetAssignmentEmails } from "@/lib/api/assignment-notifications";
import { projectCreateSchema } from "@/lib/api/validation";
import type { TeamType } from "@/lib/domain";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const currentUser = await getRequestUser(request);
    if (!currentUser) return unauthorizedResponse();

    const [projectRows, targetTaskRows, taskRows, collaboratorRows] = await Promise.all([
      db.select().from(project).orderBy(desc(project.createdAt)),
      db.select().from(projectTargetTask).orderBy(asc(projectTargetTask.urutan)),
      db.select().from(task),
      db.select().from(projectCollaboratorTeam),
    ]);
    const tasks = taskRows.map(toTaskDto);
    const targetTasksByProject = groupTargetTasksByProject(targetTaskRows);
    const collaboratorTeamsByProject = groupCollaboratorTeamsByProject(collaboratorRows);

    let visibleProjectRows = projectRows;
    if (currentUser.role === "Leader") {
      visibleProjectRows = projectRows.filter((row) => {
        const collabs = collaboratorTeamsByProject.get(row.id) ?? [];
        return (
          row.ownerTeam === currentUser.team_type ||
          collabs.includes(currentUser.team_type)
        );
      });
    } else {
      visibleProjectRows = projectRows.filter((row) => {
        const targets = targetTasksByProject.get(row.id) ?? [];
        return targets.some((target) => target.assignedUserId === currentUser.id);
      });
    }

    const projects = visibleProjectRows.map((row) => {
      const allTargets = targetTasksByProject.get(row.id) ?? [];
      const targetsForUser =
        currentUser.role === "Leader"
          ? allTargets
          : allTargets.filter((target) => target.assignedUserId === currentUser.id);
      return toProjectDto(
        row,
        targetsForUser,
        collaboratorTeamsByProject.get(row.id) ?? [],
      );
    });

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
    const ownerTeam = currentUser.team_type;
    const collaboratorTeams = Array.from(
      new Set((payload.collaborator_teams ?? []).filter((team) => team !== ownerTeam)),
    );

    const assignedUserIds = targetItems
      .map((item) => item.assignedUserId)
      .filter((id): id is string => Boolean(id));

    if (assignedUserIds.length > 0) {
      const allowedTeams = [ownerTeam, ...collaboratorTeams];
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

    const createdProject = await db.transaction(async (tx) => {
      const projectId = crypto.randomUUID();
      await tx.insert(project).values({
        id: projectId,
        namaProyek: payload.nama_proyek,
        status: payload.status,
        targetTugas: targetItems.length || payload.target_tugas,
        deadline: projectDeadline,
        ownerTeam,
      });

      if (collaboratorTeams.length > 0) {
        await tx.insert(projectCollaboratorTeam).values(
          collaboratorTeams.map((teamType) => ({
            projectId,
            teamType,
          })),
        );
      }

      const targetRows = targetItems.map((item, index) => ({
        id: crypto.randomUUID(),
        projectId,
        deskripsi: item.deskripsi,
        assignedUserId: item.assignedUserId,
        status: item.status,
        mulai: item.mulai,
        deadline: item.deadline,
        urutan: index + 1,
      }));

      if (targetRows.length > 0) {
        await tx.insert(projectTargetTask).values(targetRows);
      }

      const [newProject] = await tx
        .select()
        .from(project)
        .where(eq(project.id, projectId))
        .limit(1);
      const newTargetTasks = await tx
        .select()
        .from(projectTargetTask)
        .where(eq(projectTargetTask.projectId, projectId))
        .orderBy(asc(projectTargetTask.urutan));

      return {
        project: newProject,
        targetTasks: newTargetTasks,
        collaboratorTeams,
      };
    });

    await sendTargetAssignmentEmails({
      projectName: createdProject.project.namaProyek,
      targets: createdProject.targetTasks.map((targetTask) => ({
        assignedUserId: targetTask.assignedUserId,
        deskripsi: targetTask.deskripsi,
        mulai: targetTask.mulai,
        deadline: targetTask.deadline,
      })),
      assignedBy: currentUser.nama,
    });

    return NextResponse.json(
      {
        data: toProjectDto(
          createdProject.project,
          createdProject.targetTasks,
          createdProject.collaboratorTeams as TeamType[],
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

