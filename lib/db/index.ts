import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

import { schema } from "@/lib/db/schema";

const databaseUrl =
  process.env.DATABASE_URL ?? "mysql://user:password@localhost:3306/project_management";

const globalForDb = globalThis as unknown as {
  mysqlClient?: mysql.Pool;
};

export const queryClient =
  globalForDb.mysqlClient ??
  mysql.createPool({
    uri: databaseUrl,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.mysqlClient = queryClient;
}

export const db = drizzle({
  client: queryClient,
  schema,
  mode: "default",
});

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}
