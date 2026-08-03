# syntax=docker/dockerfile:1

# Multi-stage build for the Biggbee CRM (Next.js, standalone output).
# Final image contains only the standalone server + static assets -- no source, no dev deps,
# no full node_modules tree, and no .env files (secrets are injected at runtime by Compose).

ARG NODE_VERSION=22-alpine

# ---- deps: install once, cached separately from source changes ----
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- builder: compile with real deps, but no secrets baked in ----
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATA_MODE=mock only satisfies build-time static analysis (e.g. generateMetadata); real values
# are provided at container runtime via docker-compose's env_file and never baked into the image.
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATA_MODE=mock
RUN npm run build

# ---- runner: minimal production image ----
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# CRM-owned local data (admin account, sessions, audit log) -- a named volume is mounted here at
# runtime; pre-creating it with the right ownership means Docker copies that ownership onto the
# volume the first time it's created (empty), instead of the volume defaulting to root:root.
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

# No public port mapping is declared here -- that's a Compose/deploy-time decision, not an
# image-build-time one. This container is reached only via the Traefik network.
CMD ["node", "server.js"]
