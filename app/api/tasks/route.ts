import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { projectTargetTask, task } from "@/lib/db/schema";
import {
  canAccessAssignedTarget,
  forbiddenResponse,
  getRequestUser,
  unauthorizedResponse,
} from "@/lib/api/authz";
import { toTaskDto } from "@/lib/api/mappers";
import { databaseUnavailableResponse, handleRouteError } from "@/lib/api/responses";
import { taskCreateSchema, taskDeleteSchema, taskStatusUpdateSchema } from "@/lib/api/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const currentUser = await getRequestUser(request);
    if (!currentUser) return unauthorizedResponse();

    const tasks =
      currentUser.role === "Leader"
        ? await db.select().from(task).orderBy(desc(task.createdAt))
        : await db
            .select()
            .from(task)
            .where(eq(task.userId, currentUser.id))
            .orderBy(desc(task.createdAt));

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
    const currentUser = await getRequestUser(request);
    if (!currentUser) return unauthorizedResponse();

    const payload = taskCreateSchema.parse(await request.json());
    const targetTask = payload.target_task_id
      ? await getTargetTask(payload.target_task_id, payload.project_id)
      : null;

    if (payload.target_task_id && !targetTask) {
      return NextResponse.json({ error: "Detail target tugas tidak ditemukan" }, { status: 404 });
    }

    if (targetTask && !canAccessAssignedTarget(targetTask.assignedUserId, currentUser)) {
      return forbiddenResponse("Detail tugas ini sudah ditugaskan ke anggota lain");
    }

    if (payload.target_task_id) {
      const [existingTask] = await db
        .select()
        .from(task)
        .where(eq(task.targetTaskId, payload.target_task_id))
        .limit(1);

      if (existingTask) {
        await markTargetTaskDone(payload.target_task_id, currentUser.id);

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
        userId: currentUser.id,
        deskripsi: description,
        tanggal: payload.tanggal ?? getLocalDateKey(),
      })
      .returning();

    if (payload.target_task_id) {
      await markTargetTaskDone(payload.target_task_id, currentUser.id);
    }

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

export async function PATCH(request: Request) {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const currentUser = await getRequestUser(request);
    if (!currentUser) return unauthorizedResponse();

    const payload = taskStatusUpdateSchema.parse(await request.json());
    const targetTask = await getTargetTask(payload.target_task_id, payload.project_id);

    if (!targetTask) {
      return NextResponse.json({ error: "Detail target tugas tidak ditemukan" }, { status: 404 });
    }

    if (!canAccessAssignedTarget(targetTask.assignedUserId, currentUser)) {
      return forbiddenResponse("Detail tugas ini sudah ditugaskan ke anggota lain");
    }

    const updatedTask = await db.transaction(async (tx) => {
      await tx
        .update(projectTargetTask)
        .set({
          status: payload.status,
          assignedUserId:
            targetTask.assignedUserId ??
            (payload.status === "Belum Mulai" ? null : currentUser.id),
          updatedAt: new Date(),
        })
        .where(eq(projectTargetTask.id, payload.target_task_id));

      if (payload.status !== "Selesai") {
        await tx
          .delete(task)
          .where(
            and(
              eq(task.projectId, payload.project_id),
              eq(task.targetTaskId, payload.target_task_id),
            ),
          );

        return null;
      }

      const [existingTask] = await tx
        .select()
        .from(task)
        .where(eq(task.targetTaskId, payload.target_task_id))
        .limit(1);

      if (existingTask) {
        return existingTask;
      }

      const [createdTask] = await tx
        .insert(task)
        .values({
          id: crypto.randomUUID(),
          projectId: payload.project_id,
          targetTaskId: payload.target_task_id,
          userId: currentUser.id,
          deskripsi: targetTask.deskripsi,
          tanggal: payload.tanggal ?? getLocalDateKey(),
        })
        .returning();

      return createdTask;
    });

    return NextResponse.json({
      data: updatedTask ? toTaskDto(updatedTask) : null,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const currentUser = await getRequestUser(request);
    if (!currentUser) return unauthorizedResponse();

    const payload = taskDeleteSchema.parse(await request.json());
    const targetTask = await getTargetTask(payload.target_task_id, payload.project_id);

    if (!targetTask) {
      return NextResponse.json({ error: "Detail target tugas tidak ditemukan" }, { status: 404 });
    }

    if (!canAccessAssignedTarget(targetTask.assignedUserId, currentUser)) {
      return forbiddenResponse("Detail tugas ini sudah ditugaskan ke anggota lain");
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(task)
        .where(
          and(
            eq(task.projectId, payload.project_id),
            eq(task.targetTaskId, payload.target_task_id),
          ),
        );

      await tx
        .update(projectTargetTask)
        .set({
          status: targetTask.assignedUserId ? "Dikerjakan" : "Belum Mulai",
          updatedAt: new Date(),
        })
        .where(eq(projectTargetTask.id, payload.target_task_id));
    });

    return NextResponse.json({
      data: {
        target_task_id: payload.target_task_id,
      },
    });
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

async function markTargetTaskDone(targetTaskId: string, userId: string) {
  const [targetTask] = await db
    .select()
    .from(projectTargetTask)
    .where(eq(projectTargetTask.id, targetTaskId))
    .limit(1);

  if (!targetTask) {
    return;
  }

  await db
    .update(projectTargetTask)
    .set({
      status: "Selesai",
      assignedUserId: targetTask.assignedUserId ?? userId,
      updatedAt: new Date(),
    })
    .where(eq(projectTargetTask.id, targetTaskId));
}

function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
