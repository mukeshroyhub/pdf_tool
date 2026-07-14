import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config";

let transporter: Transporter | null = null;

if (config.smtpEnabled) {
  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth:
      config.SMTP_USER.length > 0
        ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
        : undefined,
    // Fail fast instead of hanging when a host blocks outbound SMTP ports.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });
}

interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Splits `MAIL_FROM` like `PDF Tool <no-reply@x.com>` into name + email. */
function parseSender(from: string): { name: string; email: string } {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1] || "PDF Tool", email: match[2]! };
  return { name: "PDF Tool", email: from.trim() };
}

/**
 * Sends transactional email through Brevo's HTTPS API (port 443). This avoids
 * the SMTP ports that many hosts (Render free included) block, and returns
 * clean errors instead of crashing the process on a socket timeout.
 */
async function sendViaBrevo(mail: Mail): Promise<void> {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": config.BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: parseSender(config.MAIL_FROM),
      to: [{ email: mail.to }],
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: mail.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo API responded ${res.status}: ${body.slice(0, 200)}`);
  }
}

/**
 * Sends mail via Brevo's API when configured, else SMTP, else logs to the
 * console so verification/reset flows stay testable in development.
 */
async function send(mail: Mail): Promise<void> {
  if (config.brevoApiEnabled) {
    await sendViaBrevo(mail);
    return;
  }
  if (transporter) {
    await transporter.sendMail({ from: config.MAIL_FROM, ...mail });
    return;
  }
  console.info(
    [
      "\n━━━ DEV EMAIL (email not configured) ━━━",
      `To:      ${mail.to}`,
      `Subject: ${mail.subject}`,
      mail.text,
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n",
    ].join("\n"),
  );
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const url = `${config.WEB_URL}/verify-email?token=${token}`;
  await send({
    to,
    subject: "Verify your PDF Tool email address",
    text: `Welcome to PDF Tool!\n\nVerify your email by opening:\n${url}\n\nThis link expires in 24 hours.`,
    html: `<p>Welcome to PDF Tool!</p><p><a href="${url}">Verify your email address</a></p><p>This link expires in 24 hours.</p>`,
  });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const url = `${config.WEB_URL}/reset-password?token=${token}`;
  await send({
    to,
    subject: "Reset your PDF Tool password",
    text: `A password reset was requested for your account.\n\nReset it by opening:\n${url}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
    html: `<p>A password reset was requested for your account.</p><p><a href="${url}">Reset your password</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
  });
}
