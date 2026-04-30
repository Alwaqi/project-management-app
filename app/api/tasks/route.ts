import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { projectTargetTask, task } from "@/lib/db/schema";
import { toTaskDto } from "@/lib/api/mappers";
import { databaseUnavailableResponse, handleRouteError } from "@/lib/api/responses";
import { taskCreateSchema } from "@/lib/api/validation";

export const runtime = "nodejs";

export async function GET() {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const tasks = await db.select().from(task).orderBy(desc(task.createdAt));

    return NextResponse.json({
      data: tasks.map(toTaskDto),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const payload = taskCreateSchema.parse(await request.json());
    const targetTask = payload.target_task_id
      ? await getTargetTask(payload.target_task_id, payload.project_id)
      : null;

    if (payload.target_task_id && !targetTask) {
      return NextResponse.json({ error: "Detail target tugas tidak ditemukan" }, { status: 404 });
    }

    if (payload.target_task_id) {
      const [existingTask] = await db
        .select()
        .from(task)
        .where(eq(task.targetTaskId, payload.target_task_id))
        .limit(1);

      if (existingTask) {
        return NextResponse.json({
          data: toTaskDto(existingTask),
        });
      }
    }

    const description = targetTask?.deskripsi ?? payload.deskripsi;

    if (!description) {
      return NextResponse.json({ error: "Deskripsi wajib diisi" }, { status: 400 });
    }

    const [createdTask] = await db
      .insert(task)
      .values({
        id: crypto.randomUUID(),
        projectId: payload.project_id,
        targetTaskId: payload.target_task_id ?? null,
        userId: payload.user_id,
        deskripsi: description,
        tanggal: payload.tanggal ?? getLocalDateKey(),
      })
      .returning();

    return NextResponse.json(
      {
        data: toTaskDto(createdTask),
      },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

async function getTargetTask(targetTaskId: string, projectId: string) {
  const [targetTask] = await db
    .select()
    .from(projectTargetTask)
    .where(and(eq(projectTargetTask.id, targetTaskId), eq(projectTargetTask.projectId, projectId)))
    .limit(1);

  return targetTask;
}

function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
