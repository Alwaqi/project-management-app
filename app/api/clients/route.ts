import { asc, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  forbiddenResponse,
  getRequestUser,
  unauthorizedResponse,
} from "@/lib/api/authz";
import { databaseUnavailableResponse, handleRouteError } from "@/lib/api/responses";
import { clientCreateSchema } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { client } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const currentUser = await getRequestUser(request);
    if (!currentUser) return unauthorizedResponse();

    const rows = await db
      .select({ id: client.id, nama: client.nama })
      .from(client)
      .orderBy(asc(client.nama));

    return NextResponse.json({ data: rows });
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
    if (currentUser.role !== "Leader" && currentUser.role !== "Manajemen") {
      return forbiddenResponse("Hanya Leader atau Manajemen yang bisa menambah client");
    }

    const payload = clientCreateSchema.parse(await request.json());
    const id = crypto.randomUUID();

    // Idempotent upsert: jika nama sudah ada, kembalikan row eksisting.
    const [row] = await db
      .insert(client)
      .values({ id, nama: payload.nama })
      .onConflictDoUpdate({
        target: client.nama,
        set: { nama: sql`excluded.nama` },
      })
      .returning({ id: client.id, nama: client.nama });

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
