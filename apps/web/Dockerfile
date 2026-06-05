# syntax=docker/dockerfile:1
# Production image for the web app (Next.js standalone). Built from the
# monorepo root context so workspace packages resolve.
FROM oven/bun:1.1.42 AS base
WORKDIR /app

# ── deps: install the whole workspace (cached on manifests) ──
FROM base AS deps
# Toolchain for native modules (better-sqlite3).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY apps/router/package.json apps/router/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/provider-sdk/package.json packages/provider-sdk/package.json
COPY packages/providers/elevenlabs/package.json packages/providers/elevenlabs/package.json
COPY packages/providers/minimax/package.json packages/providers/minimax/package.json
RUN bun install

# ── build: compile the Next.js standalone bundle ──
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN cd apps/web && bun run build

# ── runtime: minimal standalone server ──
FROM base AS runner
ENV NODE_ENV=production
# ffmpeg isn't needed by web; standalone server + static assets only.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["bun", "apps/web/server.js"]
