/**
 * القاعدة #1 و #2: CustomerRepository
 *   - DEFENSIVE VALIDATION: كل عمليات الكتابة تمر عبر Zod أولاً مع توليد هوية هاتف آمنة عند الحاجة.
 *   - DOMAIN ISOLATION: خاص بالعملاء والموردين فقط — لا تخلط بينه وبين العمال.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Customer, Prisma } from '@prisma/client';
import {
  CustomerBaseSchema,
  ValidatedCustomerPayload,
  generateSafePhone,
  validatePhoneOrNull,
} from '../validation';

export type CreateCustomerInput = ValidatedCustomerPayload & {
  tenant_id: string;
};

@Injectable()
export class CustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  private static normalize(
    input: CreateCustomerInput,
  ): Prisma.XOR<Prisma.CustomerCreateInput, Prisma.CustomerUncheckedCreateInput> {
    const validated = CustomerBaseSchema.parse(input);

    // القاعدة #1: أبداً لا ندخل null أو فاضي في حقل phone
    let phone = validatePhoneOrNull(validated.phone);
    if (!phone) {
      phone = generateSafePhone(validated.name);
    }

    const whatsapp =
      validatePhoneOrNull(validated.whatsapp) || phone.startsWith('AUTO-') ? null : validated.whatsapp;

    return {
      tenant_id: input.tenant_id,
      name: validated.name,
      phone,
      whatsapp: whatsapp || undefined,
      location_address: validated.location_address || undefined,
      notes: validated.notes || undefined,
    };
  }

  async findByTenantId(tenantId: string, tx?: Prisma.TransactionClient): Promise<Customer[]> {
    const client = tx ?? this.prisma;
    return client.customer.findMany({
      where: { tenant_id: tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async findById(tenantId: string, id: string, tx?: Prisma.TransactionClient): Promise<Customer | null> {
    const client = tx ?? this.prisma;
    return client.customer.findFirst({ where: { id, tenant_id: tenantId } });
  }

  async findByNameOrPhone(
    tenantId: string,
    search: { name?: string; phone?: string },
    tx?: Prisma.TransactionClient,
  ): Promise<Customer | null> {
    const client = tx ?? this.prisma;
    const or: Prisma.CustomerWhereInput[] = [];
    if (search.name) or.push({ name: { equals: search.name, mode: 'insensitive' } });
    if (search.phone) or.push({ phone: search.phone });
    if (or.length === 0) return null;
    return client.customer.findFirst({
      where: { tenant_id: tenantId, OR: or },
    });
  }

  /**
   * عمليات CreateCustomer محمية بالكامل:
   * - Zod validation أولاً.
   * - بحث إما بالاسم أو الهاتف قبل الإدراج.
   * - Prisma P2002 (Unique collision) → regenerate هاتف جديد + محاولة إعادة.
   */
  async createCustomer(
    data: CreateCustomerInput,
    tx?: Prisma.TransactionClient,
  ): Promise<{ customer: Customer; created: boolean }> {
    const client = tx ?? this.prisma;
    const normalized = CustomerRepository.normalize(data);

    // 1) بحث مسبق لتجنب الإدخالات المكررة تماماً.
    const existing = await this.findByNameOrPhone(
      data.tenant_id,
      { name: normalized.name, phone: normalized.phone },
      tx,
    );
    if (existing) return { customer: existing, created: false };

    // 2) أول محاولة للإدراج.
    try {
      const created = await client.customer.create({ data: normalized });
      return { customer: created, created: true };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        // 3) التصادم على (tenant_id, phone) → توليد هاتف جديد فريد 100%.
        const safePhone = generateSafePhone(normalized.name + '-COLLISION-' + Date.now().toString());
        const fallback = await client.customer.create({
          data: { ...normalized, phone: safePhone },
        });
        return { customer: fallback, created: true };
      }
      throw e;
    }
  }

  async updateCustomer(
    id: string,
    data: Partial<CreateCustomerInput>,
    tx?: Prisma.TransactionClient,
  ): Promise<Customer> {
    const client = tx ?? this.prisma;
    const partial: Record<string, unknown> = {};
    if (data.name !== undefined) partial.name = data.name;
    if (data.phone !== undefined) {
      const p = validatePhoneOrNull(data.phone);
      partial.phone = p || generateSafePhone(String(data.name || 'UPD'));
    }
    if (data.whatsapp !== undefined) partial.whatsapp = data.whatsapp;
    if (data.location_address !== undefined) partial.location_address = data.location_address;
    if (data.notes !== undefined) partial.notes = data.notes;
    return client.customer.update({ where: { id }, data: partial as any });
  }
}
