import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/lib/db";
import { schema } from "@/lib/db/schema";

const authBaseURL =
  process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const trustedOrigins = Array.from(
  new Set(
    [
      authBaseURL,
      process.env.NEXT_PUBLIC_APP_URL,
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ].filter(Boolean) as string[],
  ),
);

export const auth = betterAuth({
  appName: "Ruang Kerja Proyek",
  baseURL: authBaseURL,
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
  trustedOrigins,
});
