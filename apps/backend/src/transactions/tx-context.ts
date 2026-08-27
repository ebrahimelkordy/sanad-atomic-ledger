import { randomUUID } from 'crypto';
import { PrismaService } from '../repositories/prisma.service';

/**
 * Thread-safe AsyncLocalStorage for Prisma transactions.
 * Allows decorator-based @Transactional() without passing txClient around manually.
 */
const AsyncLocalStorageCtor: any =
  (globalThis as any).AsyncLocalStorage ??
  require('async_hooks').AsyncLocalStorage;

const txStorage = new AsyncLocalStorageCtor();

export function getCurrentTx(): any | undefined {
  const state = txStorage.getStore() as any;
  return state?.tx;
}

export function runInNewTransaction<P extends PrismaService, T>(prisma: P, fn: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx: any) => {
    const parentStore = txStorage.getStore() ?? {};
    return new Promise<T>((resolve, reject) => {
      txStorage.run({ ...parentStore, tx, id: randomUUID() }, async () => {
        try { resolve(await fn(tx)); }
        catch (err) { reject(err); }
      });
    });
  });
}

export const TX_STORAGE = {
  get: () => txStorage.getStore(),
  run: (store: any, fn: () => any) => txStorage.run(store, fn),
};
