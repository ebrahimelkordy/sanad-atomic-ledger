import { Injectable } from '@nestjs/common';
import { CustomerOrderRepository } from '../repositories/customer-order.repository';

export interface OrderFilterOptions {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class OrderQueryService {
  constructor(private readonly orderRepo: CustomerOrderRepository) {}

  async getOrders(tenantId: string, filters?: OrderFilterOptions) {
    const take = filters?.limit ?? 50;
    return this.orderRepo.findByTenant(
      tenantId,
      take,
      filters?.status,
      filters?.search,
    );
  }

  async getOrderById(tenantId: string, orderId: string) {
    return this.orderRepo.findByIdAndTenant(orderId, tenantId);
  }
}
