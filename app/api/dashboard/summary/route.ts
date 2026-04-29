import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  getMemberPerformance,
  toProjectDto,
  toProjectWithProgress,
  toTaskDto,
} from "@/lib/api/mappers";
import { databaseUnavailableResponse, handleRouteError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { project, task, user } from "@/lib/db/schema";
import { getProjectProgress } from "@/lib/domain";

export const runtime = "nodejs";

export async function GET() {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const [projectRows, taskRows, userRows] = await Promise.all([
      db.select().from(project).orderBy(desc(project.createdAt)),
      db.select().from(task).orderBy(desc(task.createdAt)),
      db.select().from(user),
    ]);
    const projects = projectRows.map(toProjectDto);
    const tasks = taskRows.map(toTaskDto);
    const users = userRows.map((item) => ({
      id: item.id,
      nama: item.name,
      email: item.email,
      role: item.role,
    }));
    const today = getLocalDateKey();
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
        },
        projects: projects.map((item) => toProjectWithProgress(item, tasks)),
        memberPerformance: getMemberPerformance(users, projects, tasks),
        recentTasks: tasks.slice(0, 8),
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
