import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import helmet from 'helmet';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // ──────────────────────────────────────────────
  // Sprint 1B — Task 1.5.2: Security Headers (Helmet)
  // Protects against common HTTP vulnerabilities:
  // XSS, Clickjacking, MIME sniffing, etc.
  // ──────────────────────────────────────────────
  app.use(helmet());

  // ──────────────────────────────────────────────
  // Sprint 1B — Task 1.5.1: CORS Configuration
  // ──────────────────────────────────────────────
  const rawOrigins = process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173';
  const allowedOrigins = rawOrigins === '*'
    ? true
    : rawOrigins.split(',').map((o) => o.trim());

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // ──────────────────────────────────────────────
  // Sprint 1B — Task 1.5.3: Global Validation Pipe
  //
  // whitelist: true           → strips any fields not in the DTO
  // forbidNonWhitelisted: true → rejects requests with unknown fields (prevents Mass Assignment)
  // transform: true           → auto-converts primitive types (string → number etc.)
  // ──────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 7860);

  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 Backend running on http://0.0.0.0:${port}`);
  logger.log(`🔒 Security: Helmet + ValidationPipe + CORS active`);
}

void bootstrap();
