import jwt from "jsonwebtoken";
import { config } from "../config";
import { unauthorized } from "./errors";

export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: config.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"],
    issuer: "pdfforge",
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET, { issuer: "pdfforge" });
    if (typeof decoded === "string" || typeof decoded.sub !== "string") {
      throw unauthorized("Invalid access token");
    }
    return { sub: decoded.sub, email: (decoded as jwt.JwtPayload).email as string };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw unauthorized("Access token expired");
    throw unauthorized("Invalid access token");
  }
}
