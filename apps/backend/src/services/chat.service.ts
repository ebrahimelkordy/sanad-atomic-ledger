import { Injectable, Logger } from '@nestjs/common';
import { AIOrchestrationService } from './ai-orchestration.service';
import { OrderProcessorService } from './order-processor.service';
import { SettlementService } from './settlement.service';
import { SalesService } from './sales.service';
import { InventoryProductRepository } from '../repositories/inventory-product.repository';
import { EmployeeRepository } from '../repositories/employee.repository';
import { PrismaService } from '../repositories/prisma.service';
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
    private readonly prisma: PrismaService,
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
      if (msgId && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(msgId)) {
        await this.prisma.chatMessage.updateMany({
          where: { id: msgId, tenant_id: tenantId },
          data: { confirmed_state: 'confirmed' },
        });
      }

      switch (actionType) {
        case 'ADD_INVENTORY': {
          const name = (actionData['name'] as string) || 'منتج جديد';
          const sku = (actionData['sku'] as string) || `SKU-${Date.now().toString().slice(-4)}`;
          const current_stock = Number(actionData['current_stock'] || 0);
          const unit_price = Number(actionData['unit_price'] || 0);
          const cost_price = Number(actionData['cost_price'] || 0);

          const existingSku = await this.inventoryProductRepository.findByTenantAndSku(tenantId, sku);
          const existingName = (await this.inventoryProductRepository.findByTenantAndName(tenantId, name))[0];
          const existingProduct = existingSku || existingName || null;

          if (existingProduct) {
            const existingCostPrice = Number((existingProduct as any).cost_price || 0);
            const updated = await this.prisma.inventoryProduct.update({
              where: { id: existingProduct.id },
              data: {
                current_stock: existingProduct.current_stock + current_stock,
                unit_price: unit_price > 0 ? unit_price : existingProduct.unit_price,
                cost_price: cost_price > 0 ? cost_price : existingCostPrice,
              },
            });
            return { reply: `✅ تم تحديث مخزون "${updated.name}" (الإجمالي: ${updated.current_stock}).`, success: true };
          }

          const newProduct = await this.inventoryProductRepository.createProduct({
            tenant_id: tenantId, sku, name, current_stock, unit_price, cost_price,
          });
          return { reply: `✅ تم إضافة "${newProduct.name}" للمخزون (SKU: ${newProduct.sku}, الكمية: ${newProduct.current_stock}).`, success: true };
        }

        case 'SALE':
        case 'ORDER': {
          const items = actionData['items'] as Array<{ productNameOrSku: string; quantity: number }> || [];
          const customerName = (actionData['partyIdentifier'] as string) || 'عميل المحل';
          const itemsToSell: Array<{ product_id: string; quantity: number }> = [];

          for (const item of items) {
            const productMatch = await this.inventoryProductRepository.findByTenantAndSku(tenantId, item.productNameOrSku)
              || (await this.inventoryProductRepository.findByTenantAndName(tenantId, item.productNameOrSku))[0];
            if (productMatch) itemsToSell.push({ product_id: productMatch.id, quantity: item.quantity });
          }

          if (itemsToSell.length === 0) {
            return { reply: '❌ لم يتم العثور على المنتجات المطلوبة.', success: false };
          }

          const saleResult = await this.salesService.createSale(tenantId, {
            customer_identifier: customerName, sale_type: 'CASH', items: itemsToSell,
          }, requestedBy);

          return { reply: `✅ فاتورة #${saleResult.invoice_number} الإجمالي: EGP ${saleResult.total_amount}.`, success: true };
        }

        case 'SETTLEMENT': {
          const partyId = (actionData['partyIdentifier'] as string) || 'عميل';
          const entryType = actionData['entryType'] as 'DEBIT' | 'CREDIT';
          const amount = Number(actionData['amount'] || 0);
          const msgId = `CHAT-SETTLE-${Date.now()}`;
          await this.settlementService.requestSettlement(tenantId, partyId, entryType, amount, requestedBy, msgId, `Chat settlement: ${entryType} ${amount}`);
          await this.settlementService.confirmSettlement(tenantId, requestedBy, 'تأكيد');
          return { reply: `✅ تم تسجيل ${entryType === 'DEBIT' ? 'مديونية' : 'سداد'} "${partyId}" بمبلغ EGP ${amount.toFixed(2)}.`, success: true };
        }

        case 'EXPENSE': {
          const expenseCategory = (actionData['expenseCategory'] as string) || 'أخرى';
          const amount = Number(actionData['amount'] || 0);
          const partyIdentifier = (actionData['partyIdentifier'] as string) || `مصروف - ${expenseCategory}`;
          if (amount <= 0) return { reply: '❌ مبلغ المصروف غير صحيح.', success: false };
          const msgId = `CHAT-EXPENSE-${Date.now()}`;
          await this.settlementService.requestSettlement(tenantId, partyIdentifier, 'DEBIT', amount, requestedBy, msgId, `مصروف ${expenseCategory}`);
          await this.settlementService.confirmSettlement(tenantId, requestedBy, 'تأكيد');
          return { reply: `✅ تم تسجيل مصروف "${expenseCategory}" بمبلغ EGP ${amount.toFixed(2)}.`, success: true };
        }

        case 'RETURN_TO_INVENTORY': {
          const items = actionData['items'] as Array<{ productNameOrSku: string; quantity: number }> || [];
          const returnParty = (actionData['partyIdentifier'] as string) || '';
          const results: string[] = [];
          let hasFailure = false;
          let totalValue = 0;

          for (const item of items) {
            const product = await this.inventoryProductRepository.findByTenantAndSku(tenantId, item.productNameOrSku)
              || (await this.inventoryProductRepository.findByTenantAndName(tenantId, item.productNameOrSku))[0];
            if (!product) { results.push(`❌ "${item.productNameOrSku}" غير موجود.`); hasFailure = true; continue; }
            await this.prisma.inventoryProduct.update({ where: { id: product.id }, data: { current_stock: { increment: item.quantity } } });
            results.push(`✅ إرجاع ${item.quantity} من "${product.name}" للمخزون.`);
            totalValue += item.quantity;
          }

          if (returnParty && totalValue > 0) {
            const msgId = `CHAT-RETURN-${Date.now()}`;
            await this.settlementService.requestSettlement(tenantId, returnParty, 'CREDIT', totalValue, requestedBy, msgId, `إرجاع منتجات من ${returnParty}`);
            await this.settlementService.confirmSettlement(tenantId, requestedBy, 'تأكيد');
          }

          return { reply: (hasFailure ? '⚠️' : '✅') + ' ' + results.join('\n'), success: !hasFailure };
        }

        case 'ADD_CUSTOMER': {
          const custName = (actionData['partyIdentifier'] as string) || (actionData['name'] as string) || '';
          const custPhone = (actionData['phone'] as string) || '0000000000';
          if (!custName) return { reply: '❌ اسم العميل مطلوب.', success: false };
          const existingCust = await this.prisma.customer.findFirst({ where: { tenant_id: tenantId, name: custName } });
          if (existingCust) return { reply: `ℹ️ العميل "${custName}" موجود بالفعل.`, success: true };
          const newCust = await this.prisma.customer.create({ data: { tenant_id: tenantId, name: custName, phone: custPhone, whatsapp: custPhone } });
          return { reply: `✅ تم إضافة العميل "${newCust.name}".`, success: true };
        }

        case 'MULTI_ACTION': {
          const originalActions = (actionData['actions'] as Array<{ intent: string; extractedData: Record<string, unknown>; description: string }>) || [];
          const autoActions: Array<{ intent: string; extractedData: Record<string, unknown>; description: string }> = [];
          const originalAddedEmployees = new Set<string>();
          const originalAddedCustomers = new Set<string>();
          const originalAddedProducts = new Set<string>();
          const toLowerCaseSet = (s: Set<string>, key: string) => s.add(key.trim().toLowerCase());

          for (const act of originalActions) {
            const d = act.extractedData || {};
            if (act.intent === 'ADD_EMPLOYEE' && d['employeeName']) toLowerCaseSet(originalAddedEmployees, String(d['employeeName']));
            if (act.intent === 'ADD_CUSTOMER') {
              const p = (d['partyIdentifier'] || d['name'] || '') as string;
              if (p) toLowerCaseSet(originalAddedCustomers, p);
            }
            if (act.intent === 'ADD_INVENTORY' && d['name']) toLowerCaseSet(originalAddedProducts, String(d['name']));
          }

          const existingEmployees = (await this.prisma.employee.findMany({ where: { tenant_id: tenantId }, select: { name: true } }))
            .map((e) => e.name.trim().toLowerCase());
          const existingCustomers = (await this.prisma.customer.findMany({ where: { tenant_id: tenantId }, select: { name: true } }))
            .map((c) => c.name.trim().toLowerCase());
          const existingProducts = (await this.prisma.inventoryProduct.findMany({ where: { tenant_id: tenantId }, select: { name: true, sku: true } }))
            .flatMap((p) => [p.name.trim().toLowerCase(), p.sku.trim().toLowerCase()]);

          const existingSet = new Set<string>([
            ...originalAddedEmployees, ...existingEmployees,
          ]);
          const custSet = new Set<string>([
            ...originalAddedCustomers, ...existingCustomers,
          ]);
          const prodSet = new Set<string>([
            ...originalAddedProducts, ...existingProducts,
          ]);

          for (const act of originalActions) {
            const d = act.extractedData || {};
            if (act.intent === 'EMPLOYEE_ATTENDANCE' || act.intent === 'EMPLOYEE_ADVANCE' || act.intent === 'INVENTORY_WITHDRAWAL') {
              const emp = (d['employeeName'] as string) || '';
              if (emp && !existingSet.has(emp.trim().toLowerCase())) {
                const defaultJob = act.intent === 'INVENTORY_WITHDRAWAL' ? 'فني' : 'عامل';
                autoActions.push({
                  intent: 'ADD_EMPLOYEE',
                  description: `إضافة تلقائية للموظف: ${emp} (${defaultJob})`,
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
                  extractedData: { partyIdentifier: p.trim(), phone: '0000000000' },
                });
                custSet.add(p.trim().toLowerCase());
              }
            }
            if (act.intent === 'INVENTORY_WITHDRAWAL') {
              const pn = (d['productName'] as string) || '';
              const qty = Number(d['quantity'] || 1);
              if (pn && !prodSet.has(pn.trim().toLowerCase())) {
                autoActions.push({
                  intent: 'ADD_INVENTORY',
                  description: `إضافة تلقائية للمنتج: ${pn} (كمية: ${qty})`,
                  extractedData: {
                    name: pn.trim(),
                    sku: `AUTO-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    current_stock: qty,
                    unit_price: 0,
                    cost_price: 0,
                  },
                });
                prodSet.add(pn.trim().toLowerCase());
              }
            }
          }

          const combinedActions = [...autoActions, ...originalActions];
          const results: string[] = [];
          let hasFailure = false;
          for (const act of combinedActions) {
            const subRes = await this.confirmAction(tenantId, act.intent, act.extractedData, requestedBy);
            results.push(subRes.reply);
            if (!subRes.success) hasFailure = true;
          }
          return { reply: (hasFailure ? '⚠️' : '🎉') + ` تم ${combinedActions.length} أوامر:\n` + results.join('\n'), success: !hasFailure };
        }

        case 'ADD_EMPLOYEE': {
          const empName = (actionData['employeeName'] as string) || 'موظف جديد';
          const jobTitle = (actionData['jobTitle'] as string) || 'عامل';
          const baseRate = Number(actionData['baseRate'] || 0);
          const salaryType = (actionData['salaryType'] as 'DAILY' | 'MONTHLY') || 'DAILY';
          const autoAttendance = Boolean(actionData['autoAttendance'] ?? true);
          const existing = await this.prisma.employee.findFirst({ where: { tenant_id: tenantId, name: empName } });
          if (existing) return { reply: `ℹ️ "${empName}" موجود بالفعل.`, success: true };
          const newEmp = await this.employeeRepository.createEmployee({ tenant_id: tenantId, name: empName, job_title: jobTitle, salary_type: salaryType, base_rate: baseRate, auto_attendance: autoAttendance });
          return { reply: `✅ تم إضافة "${newEmp.name}" (${newEmp.job_title}).`, success: true };
        }

        case 'EMPLOYEE_ATTENDANCE': {
          const empName = (actionData['employeeName'] as string) || '';
          const status = (actionData['attendanceStatus'] as string) || 'PRESENT';
          const date = (actionData['date'] as string) || new Date().toISOString().slice(0, 10);
          const emp = await this.prisma.employee.findFirst({ where: { tenant_id: tenantId, name: { contains: empName, mode: 'insensitive' } } });
          if (!emp) return { reply: `❌ لم يتم العثور على "${empName}".`, success: false };
          await this.employeeRepository.recordAttendance({ employee_id: emp.id, date: new Date(date), status: status as any });
          const statusLabel = status === 'PRESENT' ? 'حضور' : status === 'ABSENT' ? 'غياب' : 'إجازة';
          return { reply: `✅ تم تسجيل ${statusLabel} "${emp.name}" بتاريخ ${date}.`, success: true };
        }

        case 'EMPLOYEE_ADVANCE': {
          const empName = (actionData['employeeName'] as string) || '';
          const txType = (actionData['transactionType'] as string) || 'ADVANCE';
          const amount = Number(actionData['amount'] || 0);
          const emp = await this.prisma.employee.findFirst({ where: { tenant_id: tenantId, name: { contains: empName, mode: 'insensitive' } } });
          if (!emp) return { reply: `❌ لم يتم العثور على "${empName}".`, success: false };
          const partyIdentifier = `موظف: ${emp.name}`;
          const entryType = (txType === 'ADVANCE' || txType === 'DEDUCTION') ? 'DEBIT' : 'CREDIT';
          const msgId = `CHAT-EMP-${emp.id}-${Date.now()}`;
          await this.settlementService.requestSettlement(tenantId, partyIdentifier, entryType, amount, requestedBy, msgId, `Chat employee ${txType}: ${amount}`);
          await this.settlementService.confirmSettlement(tenantId, requestedBy, 'تأكيد');
          const txLabel = txType === 'ADVANCE' ? 'سلفة' : txType === 'BONUS' ? 'مكافأة' : 'خصم';
          return { reply: `✅ تم تسجيل ${txLabel} لـ "${emp.name}" بمبلغ EGP ${amount.toFixed(2)}.`, success: true };
        }

        case 'INVENTORY_WITHDRAWAL': {
          const empName = (actionData['employeeName'] as string) || '';
          const productName = (actionData['productName'] as string) || '';
          const quantity = Number(actionData['quantity'] || 1);
          const emp = await this.prisma.employee.findFirst({ where: { tenant_id: tenantId, name: { contains: empName, mode: 'insensitive' } } });
          if (!emp) return { reply: `❌ لم يتم العثور على "${empName}".`, success: false };
          const product = await this.inventoryProductRepository.findByTenantAndSku(tenantId, productName)
            || (await this.inventoryProductRepository.findByTenantAndName(tenantId, productName))[0];
          if (!product) return { reply: `❌ المنتج "${productName}" غير موجود.`, success: false };
          if (product.current_stock < quantity) return { reply: `❌ المخزون غير كافٍ. المتاح: ${product.current_stock}.`, success: false };
          await this.prisma.inventoryProduct.update({ where: { id: product.id }, data: { current_stock: { decrement: quantity } } });
          const partyIdentifier = `موظف: ${emp.name}`;
          const withdrawalValue = quantity * Number(product.unit_price);
          const msgId = `CHAT-WITHDRAW-${emp.id}-${Date.now()}`;
          await this.settlementService.requestSettlement(tenantId, partyIdentifier, 'DEBIT', withdrawalValue, requestedBy, msgId, `عهدة: ${productName} x${quantity} لـ ${emp.name}`);
          await this.settlementService.confirmSettlement(tenantId, requestedBy, 'تأكيد');
          return { reply: `✅ عهدة "${product.name}" (${quantity}) بقيمة EGP ${withdrawalValue.toFixed(2)} لـ "${emp.name}".`, success: true };
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
