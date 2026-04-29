import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { schema } from "@/lib/db/schema";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/project_management";

const globalForDb = globalThis as unknown as {
  pgClient?: postgres.Sql;
};

export const queryClient =
  globalForDb.pgClient ??
  postgres(databaseUrl, {
    max: 1,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgClient = queryClient;
}

export const db = drizzle({
  client: queryClient,
  schema,
});

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}
