import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/lib/db";
import { schema } from "@/lib/db/schema";

export const auth = betterAuth({
  appName: "Ruang Kerja Proyek",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret:
    process.env.BETTER_AUTH_SECRET ??
    "development-only-change-me-please-use-a-random-secret",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: ["Leader", "Tim"],
        required: false,
        defaultValue: "Tim",
        input: true,
      },
    },
  },
  plugins: [nextCookies()],
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
});
