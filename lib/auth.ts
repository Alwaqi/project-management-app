import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/lib/db";
import { schema } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";

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
    requireEmailVerification: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      const result = await sendEmail({
        to: user.email,
        subject: "Verifikasi email ProTrack SDK",
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
            <h2 style="margin: 0 0 12px;">Verifikasi email Anda</h2>
            <p>Halo ${user.name}, klik tombol di bawah ini untuk mengaktifkan akun ProTrack SDK.</p>
            <p style="margin: 24px 0;">
              <a href="${url}" style="background: #111827; color: #ffffff; padding: 12px 16px; border-radius: 8px; text-decoration: none;">
                Verifikasi Email
              </a>
            </p>
            <p>Link ini berlaku selama 24 jam. Jika Anda tidak membuat akun, abaikan email ini.</p>
          </div>
        `,
        text: [
          `Halo ${user.name},`,
          "Klik link berikut untuk mengaktifkan akun ProTrack SDK:",
          url,
          "Link ini berlaku selama 24 jam. Jika Anda tidak membuat akun, abaikan email ini.",
        ].join("\n\n"),
      });

      if (!result.sent) {
        throw new Error("Konfigurasi email belum tersedia");
      }
    },
  },
  user: {
    additionalFields: {
      role: {
        type: ["Leader", "Tim"],
        required: false,
        defaultValue: "Tim",
        input: true,
      },
      teamType: {
        type: ["Tim Sales", "Tim SE", "Tim Admin", "Tim Marketing dan Konten"],
        required: false,
        defaultValue: "Tim Sales",
        input: true,
      },
    },
  },
  plugins: [nextCookies()],
  trustedOrigins,
});
