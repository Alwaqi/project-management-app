import { desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  groupCollaboratorTeamsByProject,
  groupTargetTasksByProject,
  toProjectDto,
  toProjectWithProgress,
  toTaskDto,
} from "@/lib/api/mappers";
import {
  forbiddenResponse,
  getAccessibleProjectIdsForLeader,
  getRequestUser,
  unauthorizedResponse,
} from "@/lib/api/authz";
import { databaseUnavailableResponse, handleRouteError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import {
  project,
  projectCollaboratorTeam,
  projectTargetTask,
  task,
  user,
} from "@/lib/db/schema";
import {
  getDaysUntilDeadline,
  getLocalDateKey,
  getProjectProgress,
  isProjectOverdue,
} from "@/lib/domain";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const currentUser = await getRequestUser(request);
    if (!currentUser) return unauthorizedResponse();
    if (currentUser.role !== "Leader" && currentUser.role !== "Manajemen") {
      return forbiddenResponse("Dashboard hanya untuk Leader / Manajemen");
    }

    const accessibleProjectIds = (await getAccessibleProjectIdsForLeader(currentUser)) ?? [];

    if (accessibleProjectIds.length === 0) {
      return NextResponse.json({
        data: {
          metrics: {
            proyek_berjalan: 0,
            tugas_hari_ini: 0,
            rata_rata_progress: 0,
            proyek_selesai: 0,
            proyek_overdue: 0,
            deadline_minggu_ini: 0,
          },
          projects: [],
          memberPerformance: [],
          deadlineTracking: {
            overdueProjects: [],
            dueSoonProjects: [],
            withoutDeadline: 0,
          },
          recentTasks: [],
        },
      });
    }

    const [projectRows, targetTaskRows, taskRows, collaboratorRows, userRows] = await Promise.all([
      db
        .select()
        .from(project)
        .where(inArray(project.id, accessibleProjectIds))
        .orderBy(desc(project.createdAt)),
      db
        .select()
        .from(projectTargetTask)
        .where(inArray(projectTargetTask.projectId, accessibleProjectIds)),
      db
        .select()
        .from(task)
        .where(inArray(task.projectId, accessibleProjectIds))
        .orderBy(desc(task.createdAt)),
      db
        .select()
        .from(projectCollaboratorTeam)
        .where(inArray(projectCollaboratorTeam.projectId, accessibleProjectIds)),
      currentUser.role === "Manajemen"
        ? db.select().from(user)
        : db.select().from(user).where(eq(user.teamType, currentUser.team_type)),
    ]);

    const targetTasksByProject = groupTargetTasksByProject(targetTaskRows);
    const collaboratorTeamsByProject = groupCollaboratorTeamsByProject(collaboratorRows);
    const projects = projectRows.map((item) =>
      toProjectDto(
        item,
        targetTasksByProject.get(item.id) ?? [],
        collaboratorTeamsByProject.get(item.id) ?? [],
      ),
    );
    const tasks = taskRows.map(toTaskDto);
    const teamUsers = userRows.map((item) => ({
      id: item.id,
      nama: item.name,
      email: item.email,
      role: item.role,
      team_type: item.teamType,
    }));
    const today = getLocalDateKey();
    const projectsWithProgress = projects.map((item) => toProjectWithProgress(item, tasks));
    const overdueProjects = projectsWithProgress.filter((item) => isProjectOverdue(item, today));
    const dueSoonProjects = projectsWithProgress.filter((item) => {
      if (!item.deadline || item.status === "Selesai" || isProjectOverdue(item, today)) {
        return false;
      }

      const daysLeft = getDaysUntilDeadline(item.deadline, today);
      return daysLeft >= 0 && daysLeft <= 7;
    });
    const averageProgress = projects.length
      ? Math.round(
          projects.reduce((sum, item) => sum + getProjectProgress(item, tasks), 0) /
            projects.length,
        )
      : 0;

    const memberPerformance = computeTeamMemberPerformance(teamUsers, projects, tasks);

    return NextResponse.json({
      data: {
        metrics: {
          proyek_berjalan: projects.filter((item) => item.status === "Berjalan").length,
          tugas_hari_ini: tasks.filter((item) => item.tanggal === today).length,
          rata_rata_progress: averageProgress,
          proyek_selesai: projects.filter((item) => item.status === "Selesai").length,
          proyek_overdue: overdueProjects.length,
          deadline_minggu_ini: dueSoonProjects.length,
        },
        projects: projectsWithProgress,
        memberPerformance,
        deadlineTracking: {
          overdueProjects,
          dueSoonProjects,
          withoutDeadline: projectsWithProgress.filter(
            (item) => !item.deadline && item.status !== "Selesai",
          ).length,
        },
        recentTasks: tasks.slice(0, 8),
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

function computeTeamMemberPerformance(
  users: Array<{
    id: string;
    nama: string;
    email: string;
    role: string;
    team_type: string;
  }>,
  projects: Array<{
    target_detail_tugas: Array<{ id: string; assigned_user_id: string | null; status: string }>;
  }>,
  tasks: Array<{ id: string; target_task_id: string | null; user_id: string }>,
) {
  const completionByTargetId = new Map(
    tasks
      .filter((task) => task.target_task_id)
      .map((task) => [task.target_task_id as string, task]),
  );

  return users
    .map((member) => {
      const userTargetTasks = projects.flatMap((project) =>
        project.target_detail_tugas.filter((target) => {
          const completedTask = completionByTargetId.get(target.id);
          const ownerId = target.assigned_user_id ?? completedTask?.user_id;
          return ownerId === member.id;
        }),
      );
      const completed = userTargetTasks.filter(
        (target) => target.status === "Selesai" || completionByTargetId.has(target.id),
      ).length;
      const inProgress = userTargetTasks.length - completed;

      return {
        id: member.id,
        nama: member.nama,
        email: member.email,
        role: member.role,
        team_type: member.team_type,
        dikerjakan: inProgress,
        selesai: completed,
        total: userTargetTasks.length,
        rasio_selesai: userTargetTasks.length
          ? Math.round((completed / userTargetTasks.length) * 100)
          : 0,
      };
    })
    .filter((member) => member.total > 0);
}
