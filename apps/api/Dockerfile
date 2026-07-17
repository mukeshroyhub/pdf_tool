FROM node:22-bookworm-slim AS base
WORKDIR /app

# fonts-liberation gives the canvas renderer standard fonts; qpdf (small) powers
# password protect / unlock. LibreOffice and Tesseract were removed to keep the
# image small and the memory footprint low enough for small instances.
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-liberation fonts-inter qpdf \
 && rm -rf /var/lib/apt/lists/*

# Reproducible install via pnpm: pnpm-lock.yaml records ALL platform variants
# of native optional deps (unlike npm's lockfile — npm/cli#4828), so the same
# committed lockfile serves Windows dev and this Linux image. --frozen-lockfile
# guarantees the image builds from exactly the pinned dependency tree.
# All workspace manifests are copied because the lockfile validates every
# importer; --filter then installs only what the API actually needs.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN corepack enable \
 && pnpm install --frozen-lockfile --filter @pdfforge/api... --filter .

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

# Run as the unprivileged 'node' user (F2, Audit #3): limits blast radius if
# the app is ever compromised. The only writable paths the API needs are the
# upload temp dir (under /tmp, world-writable) and the node user's own HOME
# (npm cache for the npx launcher).
USER node

# Sync the schema, then start. Without --accept-data-loss, a schema change that
# would DROP data aborts the deploy (protecting the data) instead of silently
# applying it; safe additive changes still apply. tsx executes TypeScript directly.
CMD ["sh", "-c", "cd apps/api && npx prisma db push && npx tsx src/index.ts"]
