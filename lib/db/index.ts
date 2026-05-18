import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { schema } from "@/lib/db/schema";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://project_manager:project_manager_password@localhost:55432/project_management";

const globalForDb = globalThis as unknown as {
  postgresClient?: postgres.Sql;
};

export const queryClient =
  globalForDb.postgresClient ??
  postgres(databaseUrl, {
    max: process.env.NODE_ENV === "production" ? 1 : 5,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.postgresClient = queryClient;
}

export const db = drizzle({
  client: queryClient,
  schema,
});

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}
