import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  getMemberPerformance,
  groupTargetTasksByProject,
  toProjectDto,
  toProjectWithProgress,
  toTaskDto,
} from "@/lib/api/mappers";
import { forbiddenResponse, getRequestUser, unauthorizedResponse } from "@/lib/api/authz";
import { databaseUnavailableResponse, handleRouteError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { project, projectTargetTask, task, user } from "@/lib/db/schema";
import { getDaysUntilDeadline, getLocalDateKey, getProjectProgress, isProjectOverdue } from "@/lib/domain";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const currentUser = await getRequestUser(request);
    if (!currentUser) return unauthorizedResponse();
    if (currentUser.role !== "Leader") return forbiddenResponse("Dashboard hanya untuk Leader");

    const [projectRows, targetTaskRows, taskRows, userRows] = await Promise.all([
      db.select().from(project).orderBy(desc(project.createdAt)),
      db.select().from(projectTargetTask),
      db.select().from(task).orderBy(desc(task.createdAt)),
      db.select().from(user),
    ]);
    const targetTasksByProject = groupTargetTasksByProject(targetTaskRows);
    const projects = projectRows.map((item) =>
      toProjectDto(item, targetTasksByProject.get(item.id) ?? []),
    );
    const tasks = taskRows.map(toTaskDto);
    const users = userRows.map((item) => ({
      id: item.id,
      nama: item.name,
      email: item.email,
      role: item.role,
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
        memberPerformance: getMemberPerformance(users, projects, tasks),
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
