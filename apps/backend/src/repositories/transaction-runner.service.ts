import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Prisma } from '@prisma/client';

/**
 * Thin wrapper around PrismaService.$transaction.
 *
 * Services inject this instead of PrismaService directly, keeping the
 * service layer decoupled from the raw database client.  The same
 * interface is used whether running inside an existing transaction
 * (via a passed `Prisma.TransactionClient`) or creating a new one.
 */
@Injectable()
export class TransactionRunner {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Execute `fn` inside a single Prisma transaction.
   *
   * Usage:
   * ```ts
   * const result = await this.tx.run(async (tx) => {
   *   const order = await orderRepo.create(data, tx);
   *   await ledgerRepo.append(data, tx);
   *   return order;
   * });
   * ```
   */
  async run<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}
