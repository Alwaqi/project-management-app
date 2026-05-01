import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/lib/db";
import { schema } from "@/lib/db/schema";

function readEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value || value === "\"\"" || value === "''") {
    return undefined;
  }

  return value;
}

const authBaseURL =
  readEnv("BETTER_AUTH_URL") ?? readEnv("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";

const trustedOrigins = Array.from(
  new Set(
    [
      authBaseURL,
      readEnv("NEXT_PUBLIC_APP_URL"),
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ].filter(Boolean) as string[],
  ),
);

export const auth = betterAuth({
  appName: "ProTrack SDK",
  baseURL: authBaseURL,
  secret:
    readEnv("BETTER_AUTH_SECRET") ??
    "protrack-sdk-local-auth-secret-please-set-env-before-real-deploy",
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
