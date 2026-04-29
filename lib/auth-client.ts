import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { auth } from "@/lib/auth";

const authClientBaseURL =
  typeof window === "undefined"
    ? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    : window.location.origin;

export const authClient = createAuthClient({
  baseURL: authClientBaseURL,
  plugins: [inferAdditionalFields<typeof auth>()],
});
