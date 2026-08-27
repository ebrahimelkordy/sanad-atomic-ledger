import { Logger } from '@nestjs/common';
import { AuthenticationState, BufferJSON, initAuthCreds } from '@whiskeysockets/baileys';
import type { Redis } from 'ioredis';

const KEY_PREFIX = 'wa-auth';

/**
 * Sprint 1A — Task 1.3: Redis-backed Baileys auth state.
 *
 * Replaces `useMultiFileAuthState` (file-system) with Redis storage so that:
 *  - Auth survives Docker container restarts (no ephemeral filesystem)
 *  - Multiple backend instances can share the same auth state
 *  - Auth keys are namespaced per tenant/number: `wa-auth:{tenantId}:{numberId}`
 *
 * Usage:
 *   const { state, saveCreds } = await useRedisAuthState(redis, tenantId, numberId);
 *   makeWASocket({ auth: state, ... });
 *   socket.ev.on('creds.update', saveCreds);
 */
export async function useRedisAuthState(
  redis: Redis,
  tenantId: string,
  numberId: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const logger = new Logger('RedisAuthState');
  const namespace = `${KEY_PREFIX}:${tenantId}:${numberId}`;

  const writeData = async (data: object, key: string): Promise<void> => {
    const serialized = JSON.stringify(data, BufferJSON.replacer);
    await redis.set(`${namespace}:${key}`, serialized);
  };

  const readData = async <T>(key: string): Promise<T | null> => {
    const raw = await redis.get(`${namespace}:${key}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw, BufferJSON.reviver) as T;
    } catch {
      logger.warn(`Failed to parse Redis auth key: ${namespace}:${key}`);
      return null;
    }
  };

  const removeData = async (key: string): Promise<void> => {
    await redis.del(`${namespace}:${key}`);
  };

  const creds = (await readData<AuthenticationState['creds']>('creds')) ?? initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result: Record<string, unknown> = {};
          await Promise.all(
            ids.map(async (id) => {
              const value = await readData<unknown>(`${type}-${id}`);
              if (value !== null) result[id] = value;
            }),
          );
          return result as any;
        },
        set: async (data) => {
          const promises: Promise<void>[] = [];
          for (const [category, entries] of Object.entries(data)) {
            for (const [id, value] of Object.entries(entries ?? {})) {
              if (value != null) {
                promises.push(writeData(value as object, `${category}-${id}`));
              } else {
                promises.push(removeData(`${category}-${id}`));
              }
            }
          }
          await Promise.all(promises);
        },
      },
    },
    saveCreds: async () => {
      await writeData(creds, 'creds');
    },
  };
}
