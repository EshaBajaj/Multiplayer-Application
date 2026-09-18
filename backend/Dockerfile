# ==========================================
# ROXSTAR Backend - Multi-stage Production Dockerfile
# ==========================================

# Stage 1: Build & Dependencies
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

RUN apk add --no-cache python3 make g++

# Backend package files
COPY backend/package*.json ./

RUN npm ci

# Backend source & static web client
COPY backend/src ./src
COPY backend/public ./public

# Database migrations
COPY database ./database

# ==========================================
# Stage 2: Production Runtime
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV PORT=5000

RUN mkdir -p /usr/src/app/uploads && \
    chown -R node:node /usr/src/app

COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /usr/src/app/package*.json ./
COPY --from=builder --chown=node:node /usr/src/app/src ./src
COPY --from=builder --chown=node:node /usr/src/app/public ./public
COPY --from=builder --chown=node:node /usr/src/app/database ./database

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

CMD ["node", "src/server.js"]
