import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../repositories/prisma.service';
import { AuthenticatedPrincipal } from '../domain/identity/principal';

/**
 * GLOBAL GUARD — applied once in AppModule.useGlobalGuards().
 * Any write operation (POST, PUT, PATCH, DELETE) on a date prior to tenant.closed_until_date
 * is rejected unless caller is Owner.
 *
 * Reads are ALWAYS allowed (no period lock impact on read-only endpoints).
 */
@Injectable()
export class PeriodLockGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const method: string = (req.method || 'GET').toUpperCase();

    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

    const principal = req.principal as AuthenticatedPrincipal | undefined;
    if (!principal) return true; // handled by auth guard upstream
    if (principal.isOwner()) return true; // owner bypass

    // Lookup tenant closed_until_date once and cache it per-request
    const cacheKey = '__period_lock_loaded';
    if (!(req as any)[cacheKey]) {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: principal.tenantId }, select: { closed_until_date: true } });
      (req as any)[cacheKey] = tenant?.closed_until_date ?? null;
    }
    const closedUntil = (req as any)[cacheKey] as Date | null;
    if (!closedUntil) return true;

    // Extract date from DTO if present (invoice_date / received_date / date / created_at)
    const body = req.body ?? {};
    const candidateDates: Date[] = [];
    for (const key of ['invoice_date', 'due_date', 'received_date', 'date', 'created_at', 'transaction_date', 'effective_date']) {
      if (!body[key]) continue;
      const d = new Date(body[key]);
      if (!isNaN(d.getTime())) candidateDates.push(d);
    }

    // Also check query params for date filters
    const query = req.query ?? {};
    for (const key of ['date', 'from', 'to']) {
      if (!query[key]) continue;
      const d = new Date(String(query[key]));
      if (!isNaN(d.getTime())) candidateDates.push(d);
    }

    // If no explicit date: default to "now" which could be inside or outside closed period
    // For safety, block writes that have no date and period is closed
    const now = new Date();
    if (candidateDates.length === 0) {
      if (now <= closedUntil) this.throwLocked(closedUntil);
      return true;
    }
    // If ANY provided date falls within closed period, reject whole request
    for (const d of candidateDates) {
      if (d <= closedUntil) this.throwLocked(closedUntil);
    }
    return true;
  }

  private throwLocked(closedUntil: Date): never {
    const until = closedUntil.toISOString().slice(0, 10);
    throw new ForbiddenException(`الفترة المالية حتى تاريخ ${until} مغلقة. فقط مالك الشركة يمكنه إدخال أو تعديل بيانات لها.`);
  }
}
