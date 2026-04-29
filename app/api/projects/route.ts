import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { project, task } from "@/lib/db/schema";
import { toProjectDto, toProjectWithProgress, toTaskDto } from "@/lib/api/mappers";
import { databaseUnavailableResponse, handleRouteError } from "@/lib/api/responses";
import { projectCreateSchema } from "@/lib/api/validation";

export const runtime = "nodejs";

export async function GET() {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const [projectRows, taskRows] = await Promise.all([
      db.select().from(project).orderBy(desc(project.createdAt)),
      db.select().from(task),
    ]);
    const tasks = taskRows.map(toTaskDto);
    const projects = projectRows.map(toProjectDto);

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
    const payload = projectCreateSchema.parse(await request.json());
    const [createdProject] = await db
      .insert(project)
      .values({
        id: crypto.randomUUID(),
        namaProyek: payload.nama_proyek,
        status: payload.status,
        targetTugas: payload.target_tugas,
      })
      .returning();

    return NextResponse.json(
      {
        data: toProjectDto(createdProject),
      },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
