import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Logger } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { PrismaService } from '../repositories/prisma.service';
import { AuthenticatedPrincipal } from '../domain/identity/principal';

/**
 * GLOBAL INTERCEPTOR. For every POST/PUT/PATCH/DELETE request:
 *   (a) captures request body, user info, route info before handle
 *   (b) after successful response → writes AuditLog with old_json (before) / new_json (response)
 *   (c) if error thrown → writes a FAILURE audit entry with error message
 * This completely removes manual audit-log calls from every service.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler<any>): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const method: string = (req.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next.handle();

    const principal = req.principal as AuthenticatedPrincipal | undefined;
    const ip = req.ip || (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() || undefined;
    const ua = req.headers?.['user-agent'] as string | undefined;
    const controllerName = context.getClass().name;
    const handlerName = context.getHandler().name;
    const entityType = this.guessEntityType(controllerName, handlerName, req.route?.path);
    const actionType = this.guessAction(method, handlerName);
    const traceId = (req as any).traceId;
    const bodySnapshot = structuredCloneSafe(req.body);

    return next.handle().pipe(
      tap(async (responseBody: any) => {
        try {
          await this.prisma.auditLog.create({
            data: {
              tenant_id: principal?.tenantId ?? 'NO_TENANT',
              user_id: principal?.userId ?? null,
              action_type: `${actionType}_SUCCESS`,
              entity_type: entityType,
              entity_id: extractEntityId(responseBody) ?? extractEntityId(req.params) ?? req.body?.id ?? req.body?.userId ?? req.body?.saleId ?? null,
              old_json: bodySnapshot as any,
              new_json: structuredCloneSafe(responseBody) as any,
              ip_address: ip ?? null,
              user_agent: ua ?? null,
              trace_id: traceId ?? null,
            },
          });
        } catch (e) {
          this.logger.warn('AuditInterceptor write failed', e as any);
        }
      }),
      catchError(async (err: any) => {
        try {
          await this.prisma.auditLog.create({
            data: {
              tenant_id: principal?.tenantId ?? 'NO_TENANT',
              user_id: principal?.userId ?? null,
              action_type: `${actionType}_FAILURE`,
              entity_type: entityType,
              entity_id: extractEntityId(req.params) ?? req.body?.id ?? req.body?.userId ?? null,
              old_json: bodySnapshot as any,
              new_json: {
                error: err?.message ?? String(err),
                status: err?.status ?? 500,
                code: err?.code ?? null,
              } as any,
              ip_address: ip ?? null,
              user_agent: ua ?? null,
              trace_id: traceId ?? null,
            },
          });
        } catch (e2) {
          this.logger.warn('AuditInterceptor failure logging failed', e2 as any);
        }
        return throwError(() => err);
      }),
    );
  }

  private guessEntityType(controllerName: string, handlerName: string, routePath?: string): string {
    const map: Record<string, string> = {
      AuthController: 'TENANT_USER',
      FinanceController: 'LEDGER_ENTRY',
      InventoryController: 'INVENTORY_PRODUCT',
      SalesController: 'SALE',
      EmployeeController: 'EMPLOYEE',
      TenantController: 'TENANT',
      SupplierController: 'SUPPLIER',
      PurchaseController: 'PURCHASE_INVOICE',
    };
    return map[controllerName] ?? (routePath ? String(routePath).split('/').filter(Boolean)[0]?.toUpperCase() || 'UNKNOWN' : 'UNKNOWN');
  }
  private guessAction(method: string, handler: string): string {
    const h = handler.toLowerCase();
    if (h.includes('login')) return 'LOGIN';
    if (h.includes('cancel') || h.startsWith('un')) return 'UNDO';
    if (h.includes('closeperiod')) return 'CLOSE_PERIOD';
    if (h.includes('confirmpayment') || h.includes('confirmsettle')) return 'APPROVE';
    if (h.includes('create') || method === 'POST') return 'CREATE';
    if (h.includes('update') || h.includes('edit') || method === 'PUT' || method === 'PATCH') return 'UPDATE';
    if (h.includes('delete') || method === 'DELETE') return 'DELETE';
    if (h.includes('assign') || h.includes('grant')) return 'ASSIGN';
    if (h.includes('unassign') || h.includes('revoke')) return 'REVOKE';
    return method;
  }
}

function structuredCloneSafe(input: any): any {
  if (typeof input === 'undefined' || input === null) return null;
  if (typeof input !== 'object') return input;
  try {
    if ('structuredClone' in globalThis) return (globalThis as any).structuredClone(input);
  } catch {}
  try { return JSON.parse(JSON.stringify(input)); } catch { return String(input); }
}
function extractEntityId(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of ['id','userId','saleId','orderId','productId','employeeId','tenantId','batchId','supplierId','invoiceId','entity_id']) {
    if (obj[key] != null && typeof obj[key] === 'string') return obj[key];
  }
  if (typeof obj.userId === 'string') return obj.userId;
  return null;
}
