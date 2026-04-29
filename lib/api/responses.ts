import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { isDatabaseConfigured } from "@/lib/db";

export function databaseUnavailableResponse() {
  if (isDatabaseConfigured()) {
    return null;
  }

  return NextResponse.json(
    {
      error:
        "DATABASE_URL belum dikonfigurasi. Isi .env.local, jalankan migrasi Drizzle, lalu coba lagi.",
    },
    { status: 503 },
  );
}

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Payload tidak valid",
        issues: error.issues,
      },
      { status: 400 },
    );
  }

  console.error(error);

  return NextResponse.json(
    {
      error: "Terjadi kesalahan pada server",
    },
    { status: 500 },
  );
}
