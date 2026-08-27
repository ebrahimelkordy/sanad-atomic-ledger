import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../repositories/prisma.service';
import { GenerateInventoryAlertsUseCase } from '../application/use-cases/generate-inventory-alerts.usecase';

@Injectable()
export class InventoryAlertsJob {
  private readonly logger = new Logger(InventoryAlertsJob.name);
  constructor(private readonly prisma: PrismaService, private readonly usecase: GenerateInventoryAlertsUseCase) {}

  @Cron(CronExpression.EVERY_6_HOURS, { name: 'inventory-alerts' })
  async run() {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    this.logger.log(`Running inventory alerts sweep for ${tenants.length} tenants`);
    await this.usecase.executeForAllTenants(tenants.map(t => t.id));
  }
}