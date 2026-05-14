# Riftbound App — Slice 8 production Dockerfile
#
# Multi-stage build:
#   deps    — install workspace deps once
#   builder — build the Vite SPA into web/dist
#   runner  — minimal runtime image with the bun server + dist + node_modules
#
# Build from the monorepo root:
#   docker build -t riftbound-app -f apps/riftbound-app/Dockerfile .
#
# Run:
#   docker run -p 3000:3000 \
#     -e NODE_ENV=production \
#     -e COOKIE_SECRET=$(openssl rand -hex 32) \
#     -v $(pwd)/data:/app/apps/riftbound-app/data \
#     riftbound-app

# ---------- Stage 1: deps ----------
FROM oven/bun:1.3.3-alpine AS deps

WORKDIR /app

# Workspace manifests first so install layer caches well.
COPY package.json bun.lock bunfig.toml ./
COPY packages/core/package.json ./packages/core/
COPY packages/core-types/package.json ./packages/core-types/
COPY packages/core-ui/package.json ./packages/core-ui/
COPY packages/riftbound-engine/package.json ./packages/riftbound-engine/
COPY packages/riftbound-cards/package.json ./packages/riftbound-cards/
COPY packages/riftbound-types/package.json ./packages/riftbound-types/
COPY packages/shared/package.json ./packages/shared/
COPY packages/config/package.json ./packages/config/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY apps/riftbound-app/package.json ./apps/riftbound-app/
COPY apps/riftbound-app/web/package.json ./apps/riftbound-app/web/

# Install the full workspace (bun's resolver wants every package present
# at install time to wire `workspace:*` deps).
RUN bun install --frozen-lockfile

# ---------- Stage 2: builder ----------
FROM oven/bun:1.3.3-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the SPA (web/dist).
RUN cd apps/riftbound-app/web && bun run build

# Drop dev-only files to slim the runtime layer.
RUN rm -rf \
      apps/riftbound-app/scripts \
      apps/riftbound-app/__tests__ \
      apps/riftbound-app/web/src \
      apps/riftbound-app/web/node_modules \
      downloads \
      .git

# ---------- Stage 3: runner ----------
FROM oven/bun:1.3.3-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Non-root user for runtime.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 riftbound

COPY --from=builder --chown=riftbound:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=riftbound:nodejs /app/packages ./packages
COPY --from=builder --chown=riftbound:nodejs /app/apps/riftbound-app ./apps/riftbound-app
COPY --from=builder --chown=riftbound:nodejs /app/package.json /app/bun.lock /app/bunfig.toml ./

# Pre-create the data directory for the SQLite DB so volume mounts work.
RUN mkdir -p /app/apps/riftbound-app/data && \
    chown -R riftbound:nodejs /app/apps/riftbound-app/data

USER riftbound

WORKDIR /app/apps/riftbound-app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"]

CMD ["bun", "run", "server.ts"]
