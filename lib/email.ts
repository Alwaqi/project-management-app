type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

function readEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value || value === "\"\"" || value === "''") {
    return undefined;
  }

  return value;
}

export function isEmailDeliveryConfigured() {
  return Boolean(readEnv("RESEND_API_KEY") && readEnv("EMAIL_FROM"));
}

export async function sendEmail({ to, subject, html, text }: SendEmailInput) {
  const apiKey = readEnv("RESEND_API_KEY");
  const from = readEnv("EMAIL_FROM");

  if (!apiKey || !from) {
    console.warn(
      `[email:disabled] ${subject} untuk ${to}. Set RESEND_API_KEY dan EMAIL_FROM agar email terkirim.`,
    );
    console.warn(text);
    return { sent: false, reason: "missing_config" as const };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Email gagal dikirim: ${message}`);
  }

  return { sent: true as const };
}
