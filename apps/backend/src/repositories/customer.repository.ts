import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Customer } from '@prisma/client';

export type CreateCustomerInput = {
  tenant_id: string;
  name: string;
  phone: string;
  whatsapp?: string;
  location_address?: string;
  notes?: string;
};

@Injectable()
export class CustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByTenantId(tenantId: string): Promise<Customer[]> {
    return this.prisma.customer.findMany({
      where: { tenant_id: tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async findById(tenantId: string, id: string): Promise<Customer | null> {
    return this.prisma.customer.findFirst({
      where: { id, tenant_id: tenantId },
    });
  }

  async createCustomer(data: CreateCustomerInput): Promise<Customer> {
    return this.prisma.customer.create({
      data,
    });
  }

  async updateCustomer(id: string, data: Partial<CreateCustomerInput>): Promise<Customer> {
    return this.prisma.customer.update({
      where: { id },
      data,
    });
  }
}
