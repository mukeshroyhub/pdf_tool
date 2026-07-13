FROM node:22-alpine AS builder
WORKDIR /app

# Windows-generated lockfiles can omit Linux native binaries (npm/cli#4828),
# so the image resolves dependencies fresh for linux (see api Dockerfile).
COPY package.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm install --no-audit --no-fund

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/

# The API origin is baked into the Next.js build (rewrites run at build time).
# Compose sets the default; Render passes its API URL via the API_URL build arg.
ARG API_URL=http://api:4000
ENV API_URL=${API_URL}
RUN cd apps/web && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV API_URL=http://api:4000

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/web ./apps/web

# Render (and other hosts) inject $PORT; fall back to 3000 locally.
EXPOSE 3000
CMD ["sh", "-c", "cd apps/web && npx next start -p ${PORT:-3000}"]
