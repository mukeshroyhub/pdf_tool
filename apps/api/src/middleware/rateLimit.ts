import rateLimit from "express-rate-limit";
import { config } from "../config";

const skip = () => config.isTest;

/** General API limit: 300 requests / 5 min per IP. */
export const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip,
  message: { error: { code: "RATE_LIMITED", message: "Too many requests, slow down" } },
});

/** Strict limit for credential endpoints: 10 attempts / 15 min per IP. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip,
  message: {
    error: { code: "RATE_LIMITED", message: "Too many attempts, try again later" },
  },
});
