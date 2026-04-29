import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { project } from "@/lib/db/schema";
import { toProjectDto } from "@/lib/api/mappers";
import { databaseUnavailableResponse, handleRouteError } from "@/lib/api/responses";
import { projectUpdateSchema } from "@/lib/api/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const { id } = await context.params;
    const [projectRow] = await db.select().from(project).where(eq(project.id, id)).limit(1);

    if (!projectRow) {
      return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
    }

    return NextResponse.json({
      data: toProjectDto(projectRow),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const { id } = await context.params;
    const payload = projectUpdateSchema.parse(await request.json());
    const [updatedProject] = await db
      .update(project)
      .set({
        ...(payload.nama_proyek ? { namaProyek: payload.nama_proyek } : {}),
        ...(payload.status ? { status: payload.status } : {}),
        ...(payload.target_tugas ? { targetTugas: payload.target_tugas } : {}),
        updatedAt: new Date(),
      })
      .where(eq(project.id, id))
      .returning();

    if (!updatedProject) {
      return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
    }

    return NextResponse.json({
      data: toProjectDto(updatedProject),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
