# syntax=docker/dockerfile:1
# Production image for the TTS router. Built from the monorepo root context.
# ffmpeg is included for the audio peak-normalization step.
FROM oven/bun:1.1.42 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
COPY apps/router/package.json apps/router/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/provider-sdk/package.json packages/provider-sdk/package.json
COPY packages/providers/elevenlabs/package.json packages/providers/elevenlabs/package.json
COPY packages/providers/minimax/package.json packages/providers/minimax/package.json
RUN bun install

FROM base AS runner
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock ./
COPY apps/router ./apps/router
COPY packages ./packages
EXPOSE 8080
ENV PORT=8080
CMD ["bun", "apps/router/src/index.ts"]
