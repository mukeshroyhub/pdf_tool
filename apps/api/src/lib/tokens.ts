import { createHash, randomBytes } from "node:crypto";

/**
 * Generates an opaque secret token. Only its SHA-256 hash is persisted,
 * so a database leak never exposes usable tokens.
 */
export function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(48).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
