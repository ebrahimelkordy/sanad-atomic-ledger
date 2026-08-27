#!/bin/sh
set -e

echo "🚀 Starting Sanad Backend..."

# Run database schema push if DATABASE_URL is provided
if [ -n "$DATABASE_URL" ]; then
  echo "📦 Syncing database schema with Prisma..."
  npx prisma db push --accept-data-loss || echo "⚠️ Prisma db push warning, continuing..."
fi

echo "🌟 Launching NestJS Application on port ${PORT:-7860}..."
exec node dist/main.js
