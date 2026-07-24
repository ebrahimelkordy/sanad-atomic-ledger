import { Injectable } from '@nestjs/common';
import { Tenant, VerticalType } from '@prisma/client';
import { PrismaService } from './prisma.service';

export type CreateTenantData = {
  business_name: string;
  vertical_type: VerticalType;
  password_hash?: string;
};

@Injectable()
export class TenantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createTenant(data: CreateTenantData): Promise<Tenant> {
    return this.prisma.tenant.create({
      data: {
        business_name: data.business_name,
        vertical_type: data.vertical_type,
        password_hash: data.password_hash ?? '',
      },
    });
  }

  async findById(id: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({
      where: { id },
    });
  }

  async findByName(name: string): Promise<Tenant | null> {
    return this.prisma.tenant.findFirst({
      where: { business_name: name },
    });
  }

  async findByBusinessName(name: string): Promise<Tenant | null> {
    return this.prisma.tenant.findFirst({
      where: { business_name: name },
    });
  }
}
