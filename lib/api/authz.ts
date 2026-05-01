import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import type { Role, TeamType } from "@/lib/domain";

export type RequestUser = {
  id: string;
  nama: string;
  email: string;
  role: Role;
  team_type: TeamType;
};

export async function getRequestUser(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user?.id) {
    return null;
  }

  const [currentUser] = await db
    .select({
      id: user.id,
      nama: user.name,
      email: user.email,
      role: user.role,
      team_type: user.teamType,
    })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  return currentUser ?? null;
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Sesi login diperlukan" }, { status: 401 });
}

export function forbiddenResponse(message = "Akses tidak diizinkan") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function canAccessAssignedTarget(assignedUserId: string | null, currentUser: RequestUser) {
  return (
    currentUser.role === "Leader" ||
    !assignedUserId ||
    assignedUserId === currentUser.id
  );
}
