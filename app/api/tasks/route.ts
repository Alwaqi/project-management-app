import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { task } from "@/lib/db/schema";
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
    const [createdTask] = await db
      .insert(task)
      .values({
        id: crypto.randomUUID(),
        projectId: payload.project_id,
        userId: payload.user_id,
        deskripsi: payload.deskripsi,
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

function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
