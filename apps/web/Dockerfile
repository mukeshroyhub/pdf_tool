FROM node:22-alpine AS builder
WORKDIR /app

# Reproducible install via pnpm (see api Dockerfile for the rationale).
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN corepack enable \
 && pnpm install --frozen-lockfile --filter @pdfforge/web... --filter .

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/

# The API origin is baked into the Next.js build (rewrites run at build time).
# Compose sets the default; Render passes its API URL via the API_URL build arg.
ARG API_URL=http://api:4000
ENV API_URL=${API_URL}
RUN corepack enable && pnpm --filter @pdfforge/web build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV API_URL=http://api:4000

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/web ./apps/web

# Run as the unprivileged 'node' user (F2, Audit #3). Next.js writes its
# runtime cache under .next, so that dir must belong to the runtime user.
RUN chown -R node:node /app/apps/web/.next
USER node

# Render (and other hosts) inject $PORT; fall back to 3000 locally.
EXPOSE 3000
CMD ["sh", "-c", "cd apps/web && npx next start -p ${PORT:-3000}"]
