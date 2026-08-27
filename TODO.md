# TODO — خطة إعادة هيكلة RBAC + Repositories + Auth (Clean Architecture)

## المرحلة ب: إعادة كتابة ملف الخطة 16 بمعايير هندسية عالية
- [ ] ب.1: إعادة كتابة `plans/16-excellence-driven-steps-2-to-9.md` بمعايير Clean Architecture + Ports/Adapters + DDD
- [ ] ب.2: مواءمة الخطة مع البنية الفعلية الموجودة (RBAC tables, COA, Outbox, DomainEvent, PermissionGuard, AuditInterceptor)

## المرحلة ج1: إصلاح RBAC + إزالة Enum Roles
- [ ] ج1.1: تحويل `SalesController` من `@Roles()` + `RoleGuard` إلى `@RequirePermission()` + `PermissionGuard`
- [ ] ج1.2: إزالة `SystemRole` من `role.guard.ts` (حذف/تعطيل الـ RoleGuard القديم)
- [ ] ج1.3: إصلاح `JwtAuthGuard` ليملأ `req.principal` من `req.user` (Passport)
- [ ] ج1.4: تحديث `AuthenticatedRequest` interface ليكون `principal` هو المصدر الرسمي
- [ ] ج1.5: إصلاح `AuthService.getOwnerRoleId()`

## المرحلة ج2: إصلاح Auth + JWT + Permission Guard
- [ ] ج2.1: تحويل `OrderController` من `req.user` إلى `req.principal`
- [ ] ج2.2: تحويل `TenantController` من `req.user` إلى `req.principal`
- [ ] ج2.3: تحويل `ChatController` من `req.user` إلى `req.principal`
- [ ] ج2.4: تحويل `CustomerController` من `req.user` إلى `req.principal`
- [ ] ج2.5: التأكد من أن `PermissionGuard` يعمل مع `req.principal` بشكل موحد

## المرحلة ج3: إصلاح Repositories Ports/Adapters
- [ ] ج3.1: إنشاء port interfaces (abstract classes) في `src/application/ports/`:
  - [ ] ج3.1.1: `i-tenant.port.ts`
  - [ ] ج3.1.2: `i-tenant-whatsapp-number.port.ts`
  - [ ] ج3.1.3: `i-inventory-product.port.ts`
  - [ ] ج3.1.4: `i-customer-order.port.ts`
  - [ ] ج3.1.5: `i-order-detail.port.ts`
  - [ ] ج3.1.6: `i-ledger-entry.port.ts`
  - [ ] ج3.1.7: `i-financial-ledger-summary.port.ts`
  - [ ] ج3.1.8: `i-pending-settlement.port.ts`
  - [ ] ج3.1.9: `i-sale.port.ts`
  - [ ] ج3.1.10: `i-customer.port.ts`
  - [ ] ج3.1.11: `i-employee.port.ts`
  - [ ] ج3.1.12: `i-field-worker.port.ts`
- [ ] ج3.2: جعل المستودعات الحالية تنفذ هذه الـ ports (extends abstract class)
- [ ] ج3.3: تحديث `repositories.module.ts` لربط الـ ports مع الـ implementations (useClass)
- [ ] ج3.4: الحفاظ على التوافق التام مع الكود الموجود (لا حذف للمستودعات)

## المرحلة د: Prisma Generate + Build
- [ ] د.1: تشغيل `npx prisma generate`
- [ ] د.2: تشغيل `npm run build` والتحقق من صفر أخطاء TS
- [ ] د.3: مراجعة نهائية لنتائج الـ build

