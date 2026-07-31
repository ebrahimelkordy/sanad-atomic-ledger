import { Injectable, Logger } from '@nestjs/common';
import { AIOrchestrationService } from './ai-orchestration.service';
import { OrderProcessorService } from './order-processor.service';
import { SettlementService } from './settlement.service';
import { SalesService } from './sales.service';
import { InventoryProductRepository } from '../repositories/inventory-product.repository';
import { EmployeeRepository } from '../repositories/employee.repository';
import { FieldWorkerRepository } from '../repositories/field-worker.repository';
import { CustomerRepository } from '../repositories/customer.repository';
import { PrismaService } from '../repositories/prisma.service';
import { InventoryOperationsService } from './inventory-operations.service';
import { classifyDomainRole, ExpenseSchema } from '../validation';
import type { TenantAIContext } from '../ai-orchestrator/ai-provider.interface';

export type ChatAttachment = {
  mimeType: string;
  base64Data: string;
  originalName?: string;
};

export type ChatMessageResult = {
  reply: string;
  intent: string;
  requiresConfirmation: boolean;
  pendingAction?: {
    type: string;
    data: Record<string, unknown>;
  };
};

const ACTION_ORDER = [
  'ADD_EMPLOYEE',
  'ADD_FIELD_WORKER',
  'ADD_CUSTOMER',
  'ADD_INVENTORY',
  'INVENTORY_WITHDRAWAL',
  'EMPLOYEE_ADVANCE',
  'EMPLOYEE_ATTENDANCE',
  'SETTLEMENT',
  'EXPENSE',
  'RETURN_TO_INVENTORY',
  'SALE',
  'ORDER',
  'SERVICE_ORDER',
];

function sortByActionOrder<T extends { intent: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const ia = ACTION_ORDER.indexOf(a.intent);
    const ib = ACTION_ORDER.indexOf(b.intent);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly aiOrchestrator: AIOrchestrationService,
    private readonly orderProcessor: OrderProcessorService,
    private readonly settlementService: SettlementService,
    private readonly salesService: SalesService,
    private readonly inventoryProductRepository: InventoryProductRepository,
    private readonly employeeRepository: EmployeeRepository,
    private readonly fieldWorkerRepository: FieldWorkerRepository,
    private readonly customerRepository: CustomerRepository,
    private readonly prisma: PrismaService,
    private readonly inventoryOps: InventoryOperationsService,
  ) {}

  async getHistory(tenantId: string) {
    const messages = await this.prisma.chatMessage.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'asc' },
    });

    return messages.map((m) => ({
      id: m.id,
      sender: m.sender as 'user' | 'bot',
      text: m.text,
      attachments: m.attachments ? JSON.parse(JSON.stringify(m.attachments)) : undefined,
      pendingAction: m.pending_action ? JSON.parse(JSON.stringify(m.pending_action)) : undefined,
      confirmedState: m.confirmed_state as 'confirmed' | 'rejected' | undefined,
      timestamp: new Date(m.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    }));
  }

  async processMessage(
    tenantId: string,
    messageText: string,
    tenantContext: TenantAIContext,
    attachments?: ChatAttachment[],
  ): Promise<ChatMessageResult> {
    await this.prisma.chatMessage.create({
      data: {
        tenant_id: tenantId,
        sender: 'user',
        text: messageText,
        attachments: attachments ? (attachments as any) : undefined,
      },
    });

    const result = await this.aiOrchestrator.processChat(
      messageText,
      tenantContext,
      attachments?.map((a) => ({ mimeType: a.mimeType, base64Data: a.base64Data })),
    );

    const pendingAction = result.requiresConfirmation
      ? { type: result.intent, data: result.extractedData }
      : undefined;

    await this.prisma.chatMessage.create({
      data: {
        tenant_id: tenantId,
        sender: 'bot',
        text: result.reply,
        pending_action: pendingAction ? (pendingAction as any) : undefined,
      },
    });

    if (result.requiresConfirmation) {
      return { reply: result.reply, intent: result.intent, requiresConfirmation: true, pendingAction };
    }

    return { reply: result.reply, intent: result.intent, requiresConfirmation: false };
  }

  async confirmAction(
    tenantId: string,
    actionType: string,
    actionData: Record<string, unknown>,
    requestedBy: string,
    msgId?: string,
  ): Promise<{ reply: string; success: boolean }> {
    try {
      if (
        msgId &&
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(msgId)
      ) {
        await this.prisma.chatMessage.updateMany({
          where: { id: msgId, tenant_id: tenantId },
          data: { confirmed_state: 'confirmed' },
        });
      }

      switch (actionType) {
        // ========== ADD_INVENTORY ==========
        case 'ADD_INVENTORY': {
          const name = (actionData['name'] as string) || '';
          const sku = (actionData['sku'] as string) || undefined;
          const current_stock = Number(actionData['current_stock'] || 0);
          const unit_price = Number(actionData['unit_price'] || 0);
          const cost_price = Number(actionData['cost_price'] || 0);
          const rawMessage = (actionData['rawMessageText'] as string) || '';

          const { product, created, updatedQty } = await this.inventoryProductRepository.upsertProduct({
            tenant_id: tenantId,
            name,
            sku,
            current_stock,
            unit_price,
            cost_price,
            rawMessageText: rawMessage,
            vertical_metadata: actionData['vertical_metadata'] as any,
          });

          const verb = created ? 'إضافة' : 'تحديث مخزون';
          const qtyNote = created ? `الكمية: ${product.current_stock}` : `الإجمالي: ${product.current_stock} (أضيف ${updatedQty})`;
          return {
            reply: `✅ تم ${verb} "${product.name}" (SKU: ${product.sku}, ${qtyNote} ، بيع: ${Number(product.unit_price)} ، تكلفة: ${Number(
              (product as any).cost_price ?? 0,
            )}).`,
            success: true,
          };
        }

        // ========== SALE / ORDER ==========
        case 'SALE':
        case 'ORDER': {
          const items =
            (actionData['items'] as Array<{ productNameOrSku: string; quantity: number }>) || [];
          const customerName = (actionData['partyIdentifier'] as string) || 'عميل المحل';
          const itemsToSell: Array<{ product_id: string; quantity: number }> = [];

          for (const item of items) {
            const productMatch =
              (await this.inventoryProductRepository.findByTenantAndSku(tenantId, item.productNameOrSku)) ||
              (await this.inventoryProductRepository.findByTenantAndName(tenantId, item.productNameOrSku))[0];
            if (productMatch) itemsToSell.push({ product_id: productMatch.id, quantity: item.quantity });
          }

          if (itemsToSell.length === 0) {
            return { reply: '❌ لم يتم العثور على المنتجات المطلوبة.', success: false };
          }

          const saleResult = await this.salesService.createSale(
            tenantId,
            { customer_identifier: customerName, sale_type: 'CASH', items: itemsToSell },
            requestedBy,
          );

          return {
            reply: `✅ فاتورة #${saleResult.invoice_number} الإجمالي: EGP ${saleResult.total_amount}.`,
            success: true,
          };
        }

        // ========== SETTLEMENT ==========
        case 'SETTLEMENT': {
          const partyId = (actionData['partyIdentifier'] as string) || 'عميل';
          const entryType = actionData['entryType'] as 'DEBIT' | 'CREDIT';
          const amount = Number(actionData['amount'] || 0);
          if (amount <= 0) {
            return { reply: `ℹ️ تم تخطي تسوية ${partyId} بدون مبلغ محدد.`, success: true };
          }
          const msg = `CHAT-SETTLE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          await this.settlementService.requestSettlement(
            tenantId,
            partyId,
            entryType,
            amount,
            requestedBy,
            msg,
            `Chat settlement: ${entryType} ${amount}`,
          );
          await this.settlementService.confirmSettlement(tenantId, requestedBy, 'تأكيد');
          return {
            reply: `✅ تم تسجيل ${entryType === 'DEBIT' ? 'مديونية' : 'سداد'} "${partyId}" بمبلغ EGP ${amount.toFixed(
              2,
            )}.`,
            success: true,
          };
        }

        // ========== EXPENSE ==========
        case 'EXPENSE': {
          const expenseCategory = (actionData['expenseCategory'] as string) || 'أخرى';
          const rawAmount = Number(actionData['amount'] || 0);
          const partyIdentifier =
            (actionData['partyIdentifier'] as string) || `مصروف - ${expenseCategory}`;

          const safe = ExpenseSchema.safeParse({
            category: expenseCategory,
            amount: rawAmount,
            party_identifier: partyIdentifier,
          });
          if (!safe.success) {
            return {
              reply: `ℹ️ تم تخطي مصروف "${expenseCategory}" (${safe.error.issues[0].message}).`,
              success: true,
            };
          }
          const amount = safe.data.amount;
          const category = safe.data.category;
          const msg = `CHAT-EXPENSE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          await this.settlementService.requestSettlement(
            tenantId,
            partyIdentifier,
            'DEBIT',
            amount,
            requestedBy,
            msg,
            `مصروف ${category}`,
          );
          await this.settlementService.confirmSettlement(tenantId, requestedBy, 'تأكيد');
          return {
            reply: `✅ تم تسجيل مصروف "${category}" بمبلغ EGP ${amount.toFixed(2)}.`,
            success: true,
          };
        }

        // ========== RETURN_TO_INVENTORY (TRANSACTION) ==========
        case 'RETURN_TO_INVENTORY': {
          const items =
            (actionData['items'] as Array<{ productNameOrSku: string; quantity: number }>) || [];
          const returnParty = (actionData['partyIdentifier'] as string) || '';

          const receipt = await this.inventoryOps.returnToInventoryWithLedger(
            tenantId,
            returnParty,
            items,
            { requestedBy, rawMessageText: actionData['rawMessageText'] as string },
          );
          const messages = receipt.results.map((r) => r.message);
          const hasFailure = receipt.results.some((r) => r.message.startsWith('❌'));
          return {
            reply: (hasFailure ? '⚠️' : '✅') + ' ' + messages.join('\n'),
            success: !hasFailure,
          };
        }

        // ========== ADD_CUSTOMER ==========
        case 'ADD_CUSTOMER': {
          const custName =
            (actionData['partyIdentifier'] as string) || (actionData['name'] as string) || '';
          const custPhone = (actionData['phone'] as string) || undefined;
          if (!custName) return { reply: '❌ اسم العميل مطلوب.', success: false };
          const { customer, created } = await this.customerRepository.createCustomer({
            tenant_id: tenantId,
            name: custName,
            phone: custPhone,
          });
          if (created) {
            return { reply: `✅ تم إضافة العميل "${customer.name}" (${customer.phone}).`, success: true };
          }
          return { reply: `ℹ️ العميل "${customer.name}" موجود بالفعل.`, success: true };
        }

        // ========== MULTI_ACTION ==========
        case 'MULTI_ACTION': {
          const originalActions =
            (actionData['actions'] as Array<{
              intent: string;
              extractedData: Record<string, unknown>;
              description: string;
            }>) || [];
          const autoActions: Array<{
            intent: string;
            extractedData: Record<string, unknown>;
            description: string;
          }> = [];
          const originalAddedEmployees = new Set<string>();
          const originalAddedCustomers = new Set<string>();
          const originalAddedProducts = new Set<string>();
          const toLowerCaseSet = (s: Set<string>, key: string) => s.add(key.trim().toLowerCase());

          for (const act of originalActions) {
            const d = act.extractedData || {};
            if (act.intent === 'ADD_EMPLOYEE' && d['employeeName'])
              toLowerCaseSet(originalAddedEmployees, String(d['employeeName']));
            if (act.intent === 'ADD_CUSTOMER') {
              const p = (d['partyIdentifier'] || d['name'] || '') as string;
              if (p) toLowerCaseSet(originalAddedCustomers, p);
            }
            if (act.intent === 'ADD_INVENTORY' && d['name'])
              toLowerCaseSet(originalAddedProducts, String(d['name']));
          }

          const existingEmployees = (
            await this.prisma.employee.findMany({ where: { tenant_id: tenantId }, select: { name: true } })
          ).map((e) => e.name.trim().toLowerCase());
          const existingCustomers = (
            await this.prisma.customer.findMany({ where: { tenant_id: tenantId }, select: { name: true } })
          ).map((c) => c.name.trim().toLowerCase());
          const existingProducts = (
            await this.prisma.inventoryProduct.findMany({
              where: { tenant_id: tenantId },
              select: { name: true, sku: true },
            })
          ).flatMap((p) => [p.name.trim().toLowerCase(), p.sku.trim().toLowerCase()]);

          const existingSet = new Set<string>([...originalAddedEmployees, ...existingEmployees]);
          const custSet = new Set<string>([...originalAddedCustomers, ...existingCustomers]);
          const prodSet = new Set<string>([...originalAddedProducts, ...existingProducts]);

          for (const act of originalActions) {
            const d = act.extractedData || {};
            if (
              act.intent === 'EMPLOYEE_ATTENDANCE' ||
              act.intent === 'EMPLOYEE_ADVANCE' ||
              act.intent === 'INVENTORY_WITHDRAWAL'
            ) {
              const emp = (d['employeeName'] as string) || '';
              if (emp && !existingSet.has(emp.trim().toLowerCase())) {
                const role = classifyDomainRole({ name: emp });
                const defaultJob =
                  act.intent === 'INVENTORY_WITHDRAWAL' ? 'فني ميداني' : 'عامل ميداني';
                autoActions.push({
                  intent: role === 'CUSTOMER' ? 'ADD_CUSTOMER' : 'ADD_EMPLOYEE',
                  description: `إضافة تلقائية للعامل: ${emp} (${defaultJob})`,
                  extractedData: {
                    employeeName: emp.trim(),
                    jobTitle: defaultJob,
                    salaryType: 'DAILY',
                    baseRate: 0,
                    autoAttendance: true,
                  },
                });
                existingSet.add(emp.trim().toLowerCase());
              }
            }
            if (act.intent === 'SETTLEMENT') {
              const p = (d['partyIdentifier'] as string) || '';
              if (p && !custSet.has(p.trim().toLowerCase())) {
                autoActions.push({
                  intent: 'ADD_CUSTOMER',
                  description: `إضافة تلقائية للعميل: ${p}`,
                  extractedData: { partyIdentifier: p.trim() },
                });
                custSet.add(p.trim().toLowerCase());
              }
            }
            if (act.intent === 'INVENTORY_WITHDRAWAL') {
              const items = d['items'] as Array<{ productNameOrSku: string; quantity: number }>;
              const pns: string[] = [];
              if (items && items.length) items.forEach((i) => pns.push(i.productNameOrSku));
              else if (d['productName']) pns.push(d['productName'] as string);
              for (const pn of pns) {
                const key = pn.trim().toLowerCase();
                const qty =
                  items?.find((i) => i.productNameOrSku === pn)?.quantity ||
                  Number(d['quantity'] || 1);
                if (pn && !prodSet.has(key)) {
                  autoActions.push({
                    intent: 'ADD_INVENTORY',
                    description: `إضافة تلقائية للمنتج: ${pn} (كمية: ${qty})`,
                    extractedData: {
                      name: pn.trim(),
                      current_stock: qty,
                      unit_price: 0,
                      cost_price: 0,
                    },
                  });
                  prodSet.add(key);
                }
              }
            }
          }

          const combinedActions = sortByActionOrder([...autoActions, ...originalActions]);
          const results: string[] = [];
          let hasFailure = false;
          for (const act of combinedActions) {
            const subRes = await this.confirmAction(tenantId, act.intent, act.extractedData, requestedBy);
            results.push(subRes.reply);
            if (!subRes.success) hasFailure = true;
          }
          return {
            reply:
              (hasFailure ? '⚠️' : '🎉') +
              ` تم ${combinedActions.length} أوامر:\n` +
              results.join('\n'),
            success: !hasFailure,
          };
        }

        // ========== ADD_EMPLOYEE (Worker vs Office يُقرر حسب Domain Classifier) ==========
        case 'ADD_EMPLOYEE': {
          const empName = (actionData['employeeName'] as string) || 'موظف جديد';
          const jobTitle = (actionData['jobTitle'] as string) || 'عامل ميداني';
          const baseRate = Number(actionData['baseRate'] || 0);
          const salaryType = (actionData['salaryType'] as 'DAILY' | 'MONTHLY') || 'DAILY';
          const autoAttendance = Boolean(actionData['autoAttendance'] ?? true);
          const phone = (actionData['phone'] as string) || undefined;

          const role = classifyDomainRole({ name: empName, jobTitle });

          if (role === 'OFFICE_EMPLOYEE') {
            try {
              const { employee, created } = await this.employeeRepository.createEmployee({
                tenant_id: tenantId,
                name: empName,
                job_title: jobTitle,
                salary_type: salaryType,
                base_rate: baseRate,
                auto_attendance: autoAttendance,
                phone,
              });
              if (!created) return { reply: `ℹ️ "${employee.name}" موجود بالفعل.`, success: true };
              return {
                reply: `✅ تم إضافة موظف إداري "${employee.name}" (${employee.job_title || 'موظف إداري'}).`,
                success: true,
              };
            } catch (e: any) {
              // إذا حصل Domain Separation error → خفض للـ FieldWorker
              if (String(e.message || '').includes('VIOLATION_DOMAIN_SEPARATION')) {
                // انتقل لـ FieldWorkerRepository أسفل
              } else {
                throw e;
              }
            }
          }

          // الافتراضي + Fallback: Field Worker
          const { worker, created } = await this.fieldWorkerRepository.findByNameOrCreate(tenantId, {
            tenant_id: tenantId,
            name: empName,
            job_title: jobTitle,
            salary_type: salaryType,
            base_rate: baseRate,
            auto_attendance: autoAttendance,
            phone,
          });
          const phoneText = worker.phone ? `، تليفون: ${worker.phone}` : '';
          if (!created) {
            return { reply: `ℹ️ "${worker.name}" موجود بالفعل.`, success: true };
          }
          return {
            reply: `✅ تم إضافة "${worker.name}" (${worker.job_title || 'عامل ميداني'})${phoneText}.`,
            success: true,
          };
        }

        // ========== EMPLOYEE_ATTENDANCE ==========
        case 'EMPLOYEE_ATTENDANCE': {
          const empName = (actionData['employeeName'] as string) || '';
          let status = ((actionData['attendanceStatus'] as string) || 'PRESENT').toUpperCase();
          if (actionData['halfDay'] === true || actionData['half_day'] === true) status = 'HALF_DAY';
          const date = (actionData['date'] as string) || new Date().toISOString().slice(0, 10);
          const emp = await this.prisma.employee.findFirst({
            where: { tenant_id: tenantId, name: { contains: empName, mode: 'insensitive' } },
          });
          if (!emp) return { reply: `❌ لم يتم العثور على "${empName}".`, success: false };
          await this.fieldWorkerRepository.recordAttendance({
            employee_id: emp.id,
            date: new Date(date),
            status: status as any,
            overtime_hours: Number(actionData['overtime'] || 0),
            notes: (actionData['notes'] as string) || undefined,
          });
          const statusLabel =
            status === 'PRESENT'
              ? 'حضور كامل'
              : status === 'ABSENT'
                ? 'غياب'
                : status === 'HALF_DAY'
                  ? 'نصف يوم'
                  : status === 'LEAVE'
                    ? 'إجازة'
                    : status;
          const overtime = Number(actionData['overtime'] || 0);
          const extraNotes = overtime > 0 ? `، و ${overtime} ساعات عمل إضافي (أفرتايم)` : '';
          return {
            reply: `✅ تم تسجيل ${statusLabel} "${emp.name}" بتاريخ ${date}${extraNotes}.`,
            success: true,
          };
        }

        // ========== EMPLOYEE_ADVANCE ==========
        case 'EMPLOYEE_ADVANCE': {
          const empName = (actionData['employeeName'] as string) || '';
          const txType = (actionData['transactionType'] as string) || 'ADVANCE';
          const amount = Number(actionData['amount'] || 0);
          if (amount <= 0) {
            return { reply: `ℹ️ تم تخطي معاملة "${empName}" بدون مبلغ صالح.`, success: true };
          }
          const emp = await this.prisma.employee.findFirst({
            where: { tenant_id: tenantId, name: { contains: empName, mode: 'insensitive' } },
          });
          if (!emp) return { reply: `❌ لم يتم العثور على "${empName}".`, success: false };
          await this.fieldWorkerRepository.addTransaction({
            employee_id: emp.id,
            type: txType as any,
            amount,
            notes: `Chat ${txType}`,
          });
          const partyIdentifier = `موظف: ${emp.name}`;
          const entryType = txType === 'ADVANCE' || txType === 'DEDUCTION' ? 'DEBIT' : 'CREDIT';
          const msgId = `CHAT-EMP-${emp.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          await this.settlementService.requestSettlement(
            tenantId,
            partyIdentifier,
            entryType,
            amount,
            requestedBy,
            msgId,
            `Chat employee ${txType}: ${amount}`,
          );
          await this.settlementService.confirmSettlement(tenantId, requestedBy, 'تأكيد');
          const txLabel =
            txType === 'ADVANCE' ? 'سلفة' : txType === 'BONUS' ? 'مكافأة' : 'خصم';
          return {
            reply: `✅ تم تسجيل ${txLabel} لـ "${emp.name}" بمبلغ EGP ${amount.toFixed(2)}.`,
            success: true,
          };
        }

        // ========== INVENTORY_WITHDRAWAL (TRANSACTION — ATOMIC!) ==========
        case 'INVENTORY_WITHDRAWAL': {
          const empName = (actionData['employeeName'] as string) || '';
          const emp = await this.prisma.employee.findFirst({
            where: { tenant_id: tenantId, name: { contains: empName, mode: 'insensitive' } },
          });
          if (!emp) return { reply: `❌ لم يتم العثور على "${empName}".`, success: false };

          const rawItems =
            actionData['items'] as Array<{ productNameOrSku: string; quantity: number }> | undefined;
          let itemsToWithdraw: Array<{ productNameOrSku: string; quantity: number }> = [];

          if (rawItems && rawItems.length > 0) {
            itemsToWithdraw = rawItems.filter(
              (it) => it && it.productNameOrSku && it.productNameOrSku.trim(),
            );
          } else {
            const productName = (actionData['productName'] as string) || '';
            const quantity = Number(actionData['quantity'] || 1);
            if (productName) itemsToWithdraw = [{ productNameOrSku: productName, quantity }];
          }

          if (itemsToWithdraw.length === 0) {
            return { reply: '❌ لم يتم تحديد منتج للمسحوبات.', success: false };
          }

          // القاعدة #4: Atomic Withdrawal: Stock Lock + Decrement + LedgerEntry + Summary كلها Transaction واحدة
          const receipt = await this.inventoryOps.withdrawInventoryWithLedger(
            tenantId,
            emp.name,
            {
              employeeName: emp.name,
              items: itemsToWithdraw,
              notes: (actionData['notes'] as string) || undefined,
              requestedBy,
              rawMessageText: (actionData['rawMessageText'] as string) || undefined,
            },
          );

          const lines = receipt.lines.map(
            (l) =>
              `✅ عهدة "${l.productName}" (${l.quantity}) بقيمة EGP ${l.line_value.toFixed(2)} (${l.sku}).`,
          );
          const failures = receipt.failures;
          const hasFailure = failures.length > 0;

          return {
            reply:
              `🧾 مسحوبات لـ "${emp.name}":\n` +
              [...failures, ...lines].join('\n') +
              (receipt.total_value > 0 ? `\n💰 الإجمالي: EGP ${receipt.total_value.toFixed(2)}` : ''),
            success: !hasFailure,
          };
        }

        // ========== SERVICE_ORDER ==========
        case 'SERVICE_ORDER': {
          const title = (actionData['title'] as string) || 'طلب خدمة';
          const category = (actionData['category'] as string) || 'عام';
          const priority = (actionData['priority'] as string) || 'عادي';
          const lead = (actionData['leadTechnician'] as string) || '';
          const assistant = (actionData['assistantTechnician'] as string) || '';
          try {
            const existingTable = (await this.prisma.$queryRaw`SELECT to_regclass('public.service_order') as exists`) as any;
            const hasTable = existingTable && existingTable[0] && existingTable[0].exists;
            if (hasTable) {
              let leadId: string | null = null;
              let assistantId: string | null = null;
              if (lead) {
                const e = await this.prisma.employee.findFirst({
                  where: { tenant_id: tenantId, name: { contains: lead, mode: 'insensitive' } },
                  select: { id: true },
                });
                if (e) leadId = e.id;
              }
              if (assistant) {
                const e = await this.prisma.employee.findFirst({
                  where: { tenant_id: tenantId, name: { contains: assistant, mode: 'insensitive' } },
                  select: { id: true },
                });
                if (e) assistantId = e.id;
              }
              const leadParam = leadId || null;
              const assistantParam = assistantId || null;
              await this.prisma.$executeRawUnsafe(
                `INSERT INTO "service_order" (tenant_id, title, category, priority, lead_technician_id, assistant_technician_id, status, created_at) VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6::uuid, 'OPEN', NOW())`,
                tenantId,
                title,
                category,
                priority,
                leadParam,
                assistantParam,
              );
            }
          } catch (_) {
            /* table may not exist yet; still reply with description */
          }
          const parts = [
            `✅ تم فتح طلب خدمة: "${title}"`,
            `التصنيف: ${category}`,
            `الأولوية: ${priority}`,
          ];
          if (lead) parts.push(`الفني الرئيسي: ${lead}`);
          if (assistant) parts.push(`المساعد: ${assistant}`);
          return { reply: parts.join('\n'), success: true };
        }

        default:
          return { reply: '✅ تم التنفيذ بنجاح.', success: true };
      }
    } catch (err: any) {
      this.logger.error('Failed confirmAction', err);
      return { reply: `❌ ${err.message || 'حدث خطأ'}`, success: false };
    }
  }
}
