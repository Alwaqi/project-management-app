import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  project,
  projectCollaboratorTeam,
  user,
} from "@/lib/db/schema";
import type { Role, TeamType } from "@/lib/domain";

export type RequestUser = {
  id: string;
  nama: string;
  email: string;
  role: Role;
  team_type: TeamType;
};

export async function getRequestUser(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user?.id) {
    return null;
  }

  const [currentUser] = await db
    .select({
      id: user.id,
      nama: user.name,
      email: user.email,
      role: user.role,
      team_type: user.teamType,
    })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  return currentUser ?? null;
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Sesi login diperlukan" }, { status: 401 });
}

export function forbiddenResponse(message = "Akses tidak diizinkan") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function canLeaderAccessProject(
  ownerTeam: TeamType,
  collaboratorTeams: TeamType[],
  currentUser: RequestUser,
) {
  if (currentUser.role !== "Leader") return false;
  return (
    ownerTeam === currentUser.team_type ||
    collaboratorTeams.includes(currentUser.team_type)
  );
}

export function canAccessAssignedTarget(
  assignedUserId: string | null,
  currentUser: RequestUser,
) {
  if (currentUser.role === "Leader") return true;
  return !assignedUserId || assignedUserId === currentUser.id;
}

export async function getProjectAccessContext(projectId: string) {
  const [[projectRow], collaboratorRows] = await Promise.all([
    db.select().from(project).where(eq(project.id, projectId)).limit(1),
    db
      .select({ teamType: projectCollaboratorTeam.teamType })
      .from(projectCollaboratorTeam)
      .where(eq(projectCollaboratorTeam.projectId, projectId)),
  ]);

  if (!projectRow) {
    return null;
  }

  return {
    project: projectRow,
    ownerTeam: projectRow.ownerTeam,
    collaboratorTeams: collaboratorRows.map((row) => row.teamType),
  };
}

export async function getAccessibleProjectIdsForLeader(currentUser: RequestUser) {
  if (currentUser.role !== "Leader") {
    return null;
  }

  const ownedRows = await db
    .select({ id: project.id })
    .from(project)
    .where(eq(project.ownerTeam, currentUser.team_type));

  const collabRows = await db
    .select({ id: projectCollaboratorTeam.projectId })
    .from(projectCollaboratorTeam)
    .where(eq(projectCollaboratorTeam.teamType, currentUser.team_type));

  return Array.from(new Set([...ownedRows.map((r) => r.id), ...collabRows.map((r) => r.id)]));
}

export async function isTeamMemberOfProject(
  projectId: string,
  teamType: TeamType,
) {
  const [projectRow] = await db
    .select({ ownerTeam: project.ownerTeam })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1);

  if (!projectRow) return false;
  if (projectRow.ownerTeam === teamType) return true;

  const [collab] = await db
    .select({ teamType: projectCollaboratorTeam.teamType })
    .from(projectCollaboratorTeam)
    .where(
      and(
        eq(projectCollaboratorTeam.projectId, projectId),
        eq(projectCollaboratorTeam.teamType, teamType),
      ),
    )
    .limit(1);

  return Boolean(collab);
}

export async function getAssignableUserIdsForProject(projectId: string) {
  const ctx = await getProjectAccessContext(projectId);
  if (!ctx) return new Set<string>();

  const allowedTeams = [ctx.ownerTeam, ...ctx.collaboratorTeams];
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.teamType, allowedTeams));

  return new Set(rows.map((row) => row.id));
}

