import { asc, desc, eq, inArray, sql as drizzleSql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  client,
  project,
  projectCollaboratorTeam,
  projectSpeaker,
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
import {
  isEducationLeader,
  projectCategoriesRequireSpeaker,
  type TeamType,
} from "@/lib/domain";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const currentUser = await getRequestUser(request);
    if (!currentUser) return unauthorizedResponse();

    const [
      projectRows,
      targetTaskRows,
      taskRows,
      collaboratorRows,
      clientRows,
      speakerRows,
    ] = await Promise.all([
      db.select().from(project).orderBy(desc(project.createdAt)),
      db.select().from(projectTargetTask).orderBy(asc(projectTargetTask.urutan)),
      db.select().from(task),
      db.select().from(projectCollaboratorTeam),
      db.select({ id: client.id, nama: client.nama }).from(client),
      db.select().from(projectSpeaker),
    ]);
    const tasks = taskRows.map(toTaskDto);
    const targetTasksByProject = groupTargetTasksByProject(targetTaskRows);
    const collaboratorTeamsByProject = groupCollaboratorTeamsByProject(collaboratorRows);
    const clientById = new Map(clientRows.map((row) => [row.id, row.nama] as const));
    const speakersByProject = speakerRows.reduce<Map<string, string[]>>((groups, row) => {
      const existing = groups.get(row.projectId) ?? [];
      existing.push(row.userId);
      groups.set(row.projectId, existing);
      return groups;
    }, new Map());

    let visibleProjectRows = projectRows;
    if (currentUser.role === "Manajemen") {
      visibleProjectRows = projectRows;
    } else if (currentUser.role === "Leader") {
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

    const isPrivileged = currentUser.role === "Leader" || currentUser.role === "Manajemen";
    const projects = visibleProjectRows.map((row) => {
      const allTargets = targetTasksByProject.get(row.id) ?? [];
      const targetsForUser = isPrivileged
        ? allTargets
        : allTargets.filter((target) => target.assignedUserId === currentUser.id);
      return toProjectDto(
        row,
        targetsForUser,
        collaboratorTeamsByProject.get(row.id) ?? [],
        {
          clientNama: row.clientId ? clientById.get(row.clientId) ?? null : null,
          speakerUserIds: speakersByProject.get(row.id) ?? [],
        },
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

    // Gate field tambahan untuk Leader Tim Edukasi saja
    const usesEducationFields =
      payload.category !== undefined ||
      payload.client_id !== undefined ||
      payload.client_nama_new !== undefined ||
      (payload.speaker_user_ids && payload.speaker_user_ids.length > 0);
    if (usesEducationFields && !isEducationLeader(currentUser)) {
      return forbiddenResponse(
        "Field kategori, client, dan pemateri/asesor hanya untuk Leader Tim Edukasi",
      );
    }

    let resolvedClientId: string | null = payload.client_id ?? null;
    if (payload.client_nama_new) {
      const newClientId = crypto.randomUUID();
      const [upserted] = await db
        .insert(client)
        .values({ id: newClientId, nama: payload.client_nama_new })
        .onConflictDoUpdate({
          target: client.nama,
          set: { nama: drizzleSql`excluded.nama` },
        })
        .returning({ id: client.id });
      resolvedClientId = upserted?.id ?? null;
    }

    // Speaker hanya untuk kategori yang membutuhkan
    const speakerIds =
      payload.category && projectCategoriesRequireSpeaker.includes(payload.category)
        ? Array.from(new Set(payload.speaker_user_ids ?? []))
        : [];

    if (speakerIds.length > 0) {
      const validSpeakers = await db
        .select({ id: user.id })
        .from(user)
        .where(inArray(user.id, speakerIds));
      if (validSpeakers.length !== speakerIds.length) {
        return NextResponse.json(
          { error: "Ada user pemateri/asesor yang tidak ditemukan." },
          { status: 400 },
        );
      }
    }

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
        category: payload.category ?? null,
        clientId: resolvedClientId,
      });

      if (collaboratorTeams.length > 0) {
        await tx.insert(projectCollaboratorTeam).values(
          collaboratorTeams.map((teamType) => ({
            projectId,
            teamType,
          })),
        );
      }

      if (speakerIds.length > 0) {
        await tx.insert(projectSpeaker).values(
          speakerIds.map((userId) => ({ projectId, userId })),
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
        speakerIds,
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

    let clientNama: string | null = null;
    if (createdProject.project.clientId) {
      const [row] = await db
        .select({ nama: client.nama })
        .from(client)
        .where(eq(client.id, createdProject.project.clientId))
        .limit(1);
      clientNama = row?.nama ?? null;
    }

    return NextResponse.json(
      {
        data: toProjectDto(
          createdProject.project,
          createdProject.targetTasks,
          createdProject.collaboratorTeams as TeamType[],
          {
            clientNama,
            speakerUserIds: createdProject.speakerIds,
          },
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

