import { Injectable } from '@nestjs/common';
import { OrderDetail } from '@prisma/client';
import { PrismaService } from './prisma.service';

@Injectable()
export class OrderDetailRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByOrderId(orderId: string): Promise<OrderDetail[]> {
    return this.prisma.orderDetail.findMany({
      where: { order_id: orderId },
    });
  }
}
