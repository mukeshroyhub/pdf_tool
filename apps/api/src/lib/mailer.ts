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
  });
}

interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends mail via SMTP when configured; otherwise logs the message to the
 * console so verification/reset flows remain fully testable in development.
 */
async function send(mail: Mail): Promise<void> {
  if (transporter) {
    await transporter.sendMail({ from: config.MAIL_FROM, ...mail });
    return;
  }
  // Dev fallback: print the email so links can be copied from the API console.
  console.info(
    [
      "\n━━━ DEV EMAIL (SMTP not configured) ━━━",
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
