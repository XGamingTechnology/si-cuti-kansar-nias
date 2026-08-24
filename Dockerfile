# syntax=docker/dockerfile:1.7
FROM node:24.15.0-bookworm-slim AS dependencies
WORKDIR /app

# Prisma requires OpenSSL during generate/migration operations.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY . .

# Prisma 7 loads prisma.config.ts during `prisma generate`.
# This URL is build-only and contains no staging/production credential.
ARG PRISMA_GENERATE_DATABASE_URL=postgresql://prisma-build:prisma-build@127.0.0.1:5432/prisma_build
ENV DATABASE_URL=${PRISMA_GENERATE_DATABASE_URL}

RUN npm run build

FROM dependencies AS migrator
COPY prisma.config.ts ./
COPY prisma ./prisma

FROM node:24.15.0-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["sh", "-c", ": \"${DATABASE_URL:?DATABASE_URL is required}\" && : \"${PRIVATE_STORAGE_PATH:?PRIVATE_STORAGE_PATH is required}\" && exec node server.js"]
