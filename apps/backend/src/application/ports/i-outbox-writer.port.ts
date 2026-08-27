export type OutboxPayload = { to: string; body: string; priority?: 0|1|2; correlation_id?: string; };
export interface IOutboxWriterPort {
  enqueueWhatsAppText(tenantId: string, payload: OutboxPayload): Promise<string>;
}