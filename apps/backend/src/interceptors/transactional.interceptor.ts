import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Logger } from '@nestjs/common';
import { Observable, from, lastValueFrom } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { PrismaService } from '../repositories/prisma.service';
import { runInNewTransaction } from '../transactions/tx-context';

/**
 * Decorator companion interceptor (or used via @UseInterceptors(TransactionalInterceptor)).
 * Wraps execution of an entire route handler inside prisma.$transaction().
 * Any repository that calls `getCurrentTx()` will receive the transactional client.
 */
@Injectable()
export class TransactionalInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TransactionalInterceptor.name);
  constructor(private readonly prisma: PrismaService) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return from(
      lastValueFrom(next.handle()).then((result) => {
        if (!(result && typeof (result as any).then === 'function')) {
          return result;
        }
        return runInNewTransaction(this.prisma, async () => {
          return await result;
        });
      }),
    );
  }
}

/**
 * Method decorator: wraps the entire method inside a Prisma transaction using runInNewTransaction,
 * and if the method throws, the transaction is rolled back atomically.
 *
 * Usage:
 *
 *   @Injectable()
 *   class MyService {
 *     constructor(private prisma: PrismaService) {}
 *
 *     @Transactional(MyService)
 *     async someBusinessOperation(foo: string) {
 *       // ... writes that need atomicity here ...
 *     }
 *   }
 */
export function Transactional(targetClass: any): MethodDecorator {
  return function (targetPrototype: any, methodName: string | symbol, descriptor: PropertyDescriptor) {
    const original = descriptor.value as (...args: any[]) => Promise<any>;
    descriptor.value = async function (this: any, ...args: any[]): Promise<any> {
      const prisma: PrismaService = this.prisma ?? this.txRunner?.prisma ?? findPrismaOnInstance(this);
      if (!prisma) {
        const logger = new Logger('TransactionalDecorator');
        logger.warn(`No PrismaService found on ${targetClass.name}.${String(methodName)}; executing without transaction wrapper.`);
        return original.apply(this, args);
      }
      return runInNewTransaction(prisma, () => original.apply(this, args));
    };
    return descriptor;
  };
}

function findPrismaOnInstance(instance: any): PrismaService | undefined {
  // Search for any property/DI on the service that is a PrismaService
  for (const key of Object.keys(instance ?? {})) {
    try {
      const val = instance[key];
      if (val && typeof val === 'object' && val.constructor?.name === 'PrismaService') return val as PrismaService;
      if (val && val.$transaction && typeof val.$transaction === 'function') return val as PrismaService;
    } catch {}
  }
  return undefined;
}
