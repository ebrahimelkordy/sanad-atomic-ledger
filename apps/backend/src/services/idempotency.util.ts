/**
 * Shared helpers for Prisma unique-constraint idempotency handling.
 * Services must not import `PrismaClient` — only error codes / known-request type.
 */
import { Prisma } from '@prisma/client';

export function isSourceWhatsappMessageIdConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }

  const target = error.meta?.target;
  if (typeof target === 'string') {
    return target.includes('source_whatsapp_message_id');
  }
  if (Array.isArray(target)) {
    return target.some(
      (field) =>
        typeof field === 'string' &&
        field.includes('source_whatsapp_message_id'),
    );
  }
  return false;
}
