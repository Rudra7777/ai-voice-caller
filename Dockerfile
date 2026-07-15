# Container for the LiveKit Cloud agent worker (agent/arya.ts) ONLY.
# The Next.js kitchen dashboard is deployed separately (Vercel) — this image
# never builds or runs it, so there is no `next build` step here.
# syntax=docker/dockerfile:1

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-slim AS base

# ca-certificates: the LiveKit SDK's native Rust core reads the system trust
# store at runtime, which the slim base image doesn't ship.
RUN apt-get update -qq && apt-get install --no-install-recommends -y ca-certificates && rm -rf /var/lib/apt/lists/*

# --- Build stage ---
FROM base AS build

WORKDIR /app

# Dependency files first, for layer caching.
COPY package.json package-lock.json ./

# Dev dependencies stay: tsx (a devDependency) runs the agent's TypeScript
# directly, so there is no compile step and no prune.
RUN npm ci

# Pre-download any files the agent plugins need, cached across code-only changes.
RUN npx livekit-agents download-files

# Copy the application source (minus .dockerignore).
COPY . .

# --- Production stage ---
FROM base

# Non-privileged user for the runtime container.
ARG UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/app" \
    --shell "/sbin/nologin" \
    --uid "${UID}" \
    appuser

WORKDIR /app

COPY --from=build --chown=appuser:appuser /app /app

USER appuser

ENV NODE_ENV=production

# "start" mode: connect to LiveKit Cloud and wait for inbound-call jobs.
CMD ["npm", "run", "agent"]
