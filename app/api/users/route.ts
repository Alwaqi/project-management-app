import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { databaseUnavailableResponse, handleRouteError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const unavailable = databaseUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const users = await db.select().from(user).orderBy(asc(user.name));

    return NextResponse.json({
      data: users.map((item) => ({
        id: item.id,
        nama: item.name,
        email: item.email,
        role: item.role,
        team_type: item.teamType,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
