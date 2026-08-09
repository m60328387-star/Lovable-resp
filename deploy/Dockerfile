# syntax=docker/dockerfile:1
FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock* package-lock.json* ./
RUN bun install --frozen-lockfile || bun install

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV WEAVER_BUILD_TARGET=node
ENV NODE_ENV=production
RUN bun run build

# Nitro node-server emits the production server under .output/
FROM node:22-alpine
WORKDIR /app

COPY --from=builder /app/.output/ ./

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server/index.mjs"]
