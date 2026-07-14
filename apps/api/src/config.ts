import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  API_URL: z.string().url().default("http://localhost:4000"),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  MAIL_FROM: z.string().default("PDF Tool <no-reply@pdfforge.local>"),
  // Brevo transactional email over HTTPS (port 443). Preferred over SMTP,
  // which many hosts (incl. Render free) block on ports 25/465/587.
  BREVO_API_KEY: z.string().optional().default(""),

  // Object storage: "local" (disk) in dev, "s3" (S3-compatible, e.g. R2) in prod.
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  S3_BUCKET: z.string().optional().default(""),
  S3_REGION: z.string().optional().default("auto"),
  S3_ENDPOINT: z.string().optional().default(""),
  S3_ACCESS_KEY_ID: z.string().optional().default(""),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

if (parsed.data.STORAGE_DRIVER === "s3") {
  const missing = (
    ["S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const
  ).filter((k) => parsed.data[k].length === 0);
  if (missing.length > 0) {
    throw new Error(
      `STORAGE_DRIVER=s3 requires: ${missing.join(", ")}. Set them or use STORAGE_DRIVER=local.`,
    );
  }
}

export const config = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === "production",
  isTest: parsed.data.NODE_ENV === "test",
  googleOAuthEnabled:
    parsed.data.GOOGLE_CLIENT_ID.length > 0 && parsed.data.GOOGLE_CLIENT_SECRET.length > 0,
  brevoApiEnabled: parsed.data.BREVO_API_KEY.length > 0,
  smtpEnabled: parsed.data.SMTP_HOST.length > 0,
  emailEnabled: parsed.data.BREVO_API_KEY.length > 0 || parsed.data.SMTP_HOST.length > 0,
} as const;
