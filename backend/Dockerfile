# ---- Build stage ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ---- Runtime stage ----
FROM node:20-alpine

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy node_modules from builder, then prune dev deps
COPY --from=builder /app/node_modules ./node_modules
COPY package.json package-lock.json ./
RUN npm prune --omit=dev && npm cache clean --force

# Compiled output
COPY --from=builder /app/dist ./dist

# DB artifacts (for drizzle-kit push if needed)
COPY drizzle/ ./drizzle/
COPY migrations/ ./migrations/

# Worker supervisor scripts
COPY scripts/ ./scripts/
RUN chmod +x ./scripts/*.sh

USER appuser

EXPOSE 3000

CMD ["node", "dist/server.js"]
