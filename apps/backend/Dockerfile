FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace files
COPY package.json tsconfig.base.json ./

# Copy backend package
COPY apps/backend/package.json apps/backend/nest-cli.json apps/backend/tsconfig*.json ./apps/backend/

# Copy shared package
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/

# Install all dependencies
RUN npm ci --workspaces --include-workspace-root

# Copy source code
COPY apps/backend/src ./apps/backend/src
COPY packages/shared/src ./packages/shared/src
COPY apps/backend/prisma ./apps/backend/prisma

# Generate Prisma client and build
RUN cd apps/backend && npx prisma generate && npm run build

# ---- Production image ----
FROM node:20-alpine AS production

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.base.json ./tsconfig.base.json

# Copy Prisma client from builder
COPY --from=builder /app/apps/backend/node_modules/.prisma ./apps/backend/node_modules/.prisma
COPY --from=builder /app/apps/backend/node_modules/@prisma ./apps/backend/node_modules/@prisma

EXPOSE 3001

WORKDIR /app/apps/backend

CMD ["node", "dist/main"]

