# ===== Stage 1: Build =====
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json tsconfig.base.json ./

# Copy backend package.json first for layer caching
COPY apps/backend/package.json apps/backend/
COPY apps/backend/tsconfig.json apps/backend/
COPY apps/backend/nest-cli.json* apps/backend/

# Install ALL dependencies (workspace)
RUN npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts

# Copy prisma schema and generate client
COPY apps/backend/prisma apps/backend/prisma
RUN cd apps/backend && npx prisma generate

# Copy backend source
COPY apps/backend/src apps/backend/src

# Build NestJS
RUN cd apps/backend && npx nest build

# ===== Stage 2: Production =====
FROM node:20-alpine AS runner

WORKDIR /app

# Install only production essentials
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/backend/package.json apps/backend/

RUN npm ci --omit=dev --ignore-scripts 2>/dev/null || npm install --omit=dev --ignore-scripts

# Copy prisma schema and regenerate for production
COPY apps/backend/prisma apps/backend/prisma
RUN cd apps/backend && npx prisma generate

# Copy compiled output and startup script from builder
COPY --from=builder /app/apps/backend/dist apps/backend/dist
COPY apps/backend/start.sh apps/backend/start.sh
RUN chmod +x apps/backend/start.sh

# Expose port (7860 is standard for Hugging Face Spaces)
ENV PORT=7860
EXPOSE 7860

# Start the application
WORKDIR /app/apps/backend
CMD ["sh", "./start.sh"]
