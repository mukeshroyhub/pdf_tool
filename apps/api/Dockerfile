FROM node:22-bookworm-slim AS base
WORKDIR /app

# fonts-liberation gives the canvas renderer standard fonts. LibreOffice (Office
# conversion) and Tesseract (OCR) were removed to keep the image small and the
# memory footprint low enough for small instances.
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

# Install workspace dependencies with the full monorepo manifest set.
# NOTE: the committed package-lock.json is generated on Windows and can omit
# Linux-only native binaries (@napi-rs/canvas, sharp — npm/cli#4828), so the
# image resolves dependencies fresh for linux-x64.
COPY package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm install --no-audit --no-fund

# Copy sources.
COPY tsconfig.base.json ./
COPY scripts/ scripts/
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/

# Production targets PostgreSQL.
RUN node scripts/use-postgres.mjs \
 && cd apps/api && npx prisma generate

ENV NODE_ENV=production
EXPOSE 4000

# Sync the schema, then start. tsx executes TypeScript directly.
CMD ["sh", "-c", "cd apps/api && npx prisma db push --accept-data-loss && npx tsx src/index.ts"]
