import { NextResponse } from "next/server";

import { isDatabaseConfigured } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    databaseConfigured: isDatabaseConfigured(),
  });
}
