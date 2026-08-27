// src/domain/policies/fifo-allocation.policy.ts
export interface AllocatableBatch {
  id: string;
  expiry_date: Date | null;
  received_date: Date;
  quantity_remaining: number;
  cost_per_unit: number;
}

export interface AllocationResult {
  batchId: string;
  taken: number;
  unitCost: number;
}

export class FifoAllocationPolicy {
  static allocate(batches: AllocatableBatch[], requiredQty: number): {
    success: boolean;
    allocated: AllocationResult[];
    totalCost: number;
    reason?: string;
  } {
    // ترتيب FIFO الصارم مع وضع الـ batches بلا expiry_date في النهاية
    const withExp   = batches.filter(b => b.expiry_date != null).sort((a,b) => a.expiry_date!.getTime() - b.expiry_date!.getTime() || a.received_date.getTime() - b.received_date.getTime());
    const noExpiry  = batches.filter(b => b.expiry_date == null).sort((a,b) => a.received_date.getTime() - b.received_date.getTime());
    const sorted = [...withExp, ...noExpiry];

    let needed = requiredQty;
    const allocated: AllocationResult[] = [];
    let totalCost = 0;
    for (const b of sorted) {
      if (needed <= 0) break;
      if (b.quantity_remaining <= 0) continue;
      const take = Math.min(b.quantity_remaining, needed);
      allocated.push({ batchId: b.id, taken: take, unitCost: b.cost_per_unit });
      totalCost += take * b.cost_per_unit;
      needed -= take;
    }

    if (needed > 0) return { success: false, allocated, totalCost, reason: `INSUFFICIENT_BATCHES: need ${requiredQty} but available is ${requiredQty - needed}` };
    return { success: true, allocated, totalCost };
  }
}