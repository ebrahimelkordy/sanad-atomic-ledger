import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  PrismaHealthIndicator,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../repositories/prisma.service';

/**
 * Sprint 2C — Task 2.3: Health Check Controller
 *
 * Exposes GET /health endpoint to monitor backend status:
 *  - PostgreSQL DB connectivity via Prisma
 *  - System memory usage (RSS limit)
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly memoryIndicator: MemoryHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaIndicator.pingCheck('database', this.prisma),
      () => this.memoryIndicator.checkHeap('memory_heap', 300 * 1024 * 1024), // 300MB heap limit check
    ]);
  }
}
