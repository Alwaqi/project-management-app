import nodemailer from "nodemailer";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

type ResendConfig = {
  apiKey: string;
  from: string;
};

function readEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value || value === "\"\"" || value === "''") {
    return undefined;
  }

  return value;
}

export function isEmailDeliveryConfigured() {
  return Boolean(getSmtpConfig() || getResendConfig());
}

export async function sendEmail({ to, subject, html, text }: SendEmailInput) {
  const smtpConfig = getSmtpConfig();

  if (smtpConfig) {
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
      },
    });

    await transporter.sendMail({
      from: smtpConfig.from,
      to,
      subject,
      html,
      text,
    });

    return { sent: true as const, provider: "smtp" as const };
  }

  const resendConfig = getResendConfig();

  if (!resendConfig) {
    console.warn(
      `[email:disabled] ${subject} untuk ${to}. Set SMTP_USER, SMTP_PASS, dan EMAIL_FROM agar email terkirim.`,
    );
    console.warn(text);
    return { sent: false, reason: "missing_config" as const };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendConfig.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendConfig.from,
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

  return { sent: true as const, provider: "resend" as const };
}

function getSmtpConfig(): SmtpConfig | null {
  const user = readEnv("SMTP_USER") ?? readEnv("GMAIL_USER");
  const pass = readEnv("SMTP_PASS") ?? readEnv("GMAIL_APP_PASSWORD");

  if (!user || !pass) {
    return null;
  }

  const port = Number(readEnv("SMTP_PORT") ?? "587");

  return {
    host: readEnv("SMTP_HOST") ?? "smtp.gmail.com",
    port,
    secure: readEnv("SMTP_SECURE") === "true" || port === 465,
    user,
    pass,
    from: readEnv("EMAIL_FROM") ?? user,
  };
}

function getResendConfig(): ResendConfig | null {
  const apiKey = readEnv("RESEND_API_KEY");
  const from = readEnv("EMAIL_FROM");

  if (!apiKey || !from) {
    return null;
  }

  return {
    apiKey,
    from,
  };
}
