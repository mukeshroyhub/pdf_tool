-- Initial schema for SQLite (development/tests).
-- Mirrors prisma/schema.prisma; applied by scripts/dev-migrate.mjs.
-- Production (PostgreSQL) is provisioned by `prisma db push` inside Docker,
-- where Prisma's schema engine can be downloaded.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "avatarUrl" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "storageUsed" BIGINT NOT NULL DEFAULT 0,
    "storageLimit" BIGINT NOT NULL DEFAULT 1073741824,
    "activityLogging" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "users_googleId_key" ON "users"("googleId");

CREATE TABLE IF NOT EXISTS "refresh_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ip" TEXT,
    CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");
CREATE INDEX IF NOT EXISTS "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

CREATE TABLE IF NOT EXISTS "action_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "action_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "action_tokens_tokenHash_key" ON "action_tokens"("tokenHash");
CREATE INDEX IF NOT EXISTS "action_tokens_userId_type_idx" ON "action_tokens"("userId", "type");

CREATE TABLE IF NOT EXISTS "files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "pageCount" INTEGER,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "files_storageKey_key" ON "files"("storageKey");
CREATE INDEX IF NOT EXISTS "files_userId_createdAt_idx" ON "files"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "activities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "fileId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "activities_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "activities_userId_createdAt_idx" ON "activities"("userId", "createdAt");
