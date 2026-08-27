import { Injectable, Logger, Optional } from '@nestjs/common';
import makeWASocket, {
  DisconnectReason,
} from '@whiskeysockets/baileys';
import type { AuthenticationState } from '@whiskeysockets/baileys';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { SessionRepositoryAdapter } from './session.repository-adapter';
import type { ConnectionStatus } from '../repositories/tenant-whatsapp-number.repository';
import { useRedisAuthState } from './redis-auth-state';

export type BaileysSessionConfig = {
  tenantId: string;
  phoneNumber: string;
  numberId: string;
};

export type WhatsappSession = {
  tenantId: string;
  phoneNumber: string;
  numberId: string;
  socket: ReturnType<typeof makeWASocket>;
  authState: AuthenticationState;
};

@Injectable()
export class BaileysSessionManagerService {
  private readonly logger = new Logger(BaileysSessionManagerService.name);
  private readonly sessions = new Map<string, WhatsappSession>();

  /** Redis client — injected if REDIS_URL or REDIS_HOST is configured */
  private readonly redis: Redis | null = null;

  constructor(
    private readonly repositoryAdapter: SessionRepositoryAdapter,
    private readonly config: ConfigService,
  ) {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (redisUrl) {
      this.redis = new Redis(redisUrl, { lazyConnect: true });
    } else {
      const host = this.config.get<string>('REDIS_HOST', 'localhost');
      const port = this.config.get<number>('REDIS_PORT', 6379);
      this.redis = new Redis({ host, port, lazyConnect: true });
    }
    this.redis?.connect().catch((err) => {
      this.logger.warn(`Redis connection failed — falling back to file auth: ${(err as Error).message}`);
    });
  }

  private getSessionKey(phoneNumber: string): string {
    return phoneNumber;
  }

  private async createAuthState(
    config: BaileysSessionConfig,
  ): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
    // Prefer Redis-backed auth (survives restarts, Docker-safe)
    if (this.redis?.status === 'ready') {
      this.logger.log(`Using Redis auth state for ${config.phoneNumber}`);
      return useRedisAuthState(this.redis, config.tenantId, config.numberId);
    }

    // Fallback: file-system auth (dev / no-Redis environments)
    this.logger.warn(
      `Redis not available — falling back to file auth for ${config.phoneNumber}`,
    );
    const { useMultiFileAuthState } = await import('@whiskeysockets/baileys');
    const authFolder = `./baileys-auth-${config.phoneNumber.replace(/[^0-9]/g, '')}`;
    return useMultiFileAuthState(authFolder);
  }

  async registerSession(
    config: BaileysSessionConfig,
  ): Promise<WhatsappSession> {
    const sessionKey = this.getSessionKey(config.phoneNumber);

    if (this.sessions.has(sessionKey)) {
      return this.sessions.get(sessionKey) as WhatsappSession;
    }

    const { state, saveCreds } = await this.createAuthState(config);

    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      shouldIgnoreJid: () => false,
    });

    socket.ev.on('creds.update', async (): Promise<void> => {
      await saveCreds();
    });

    socket.ev.on('connection.update', async (update: any) => {
      const { connection, qr, lastDisconnect } = update;

      if (qr) {
        this.logger.log(`QR code generated for ${config.phoneNumber}`);
        await this.repositoryAdapter.updateConnectionStatus(
          config.numberId,
          'PENDING_QR_SCAN',
        );
      }

      if (connection === 'open') {
        this.logger.log(`Baileys session connected for ${config.phoneNumber}`);
        await this.repositoryAdapter.updateConnectionStatus(
          config.numberId,
          'CONNECTED',
        );
      }

      if (connection === 'close') {
        this.logger.warn(
          `Baileys session disconnected for ${config.phoneNumber}`,
        );
        await this.repositoryAdapter.updateConnectionStatus(
          config.numberId,
          'DISCONNECTED',
        );

        const statusCode =
          lastDisconnect?.error?.output?.statusCode ||
          lastDisconnect?.error?.output?.payload?.statusCode;

        if (statusCode !== DisconnectReason.loggedOut) {
          this.logger.log(
            `Auto-reconnecting ${config.phoneNumber} in 5s...`,
          );
          setTimeout(() => {
            void this.reconnectSession(config);
          }, 5000);
        } else {
          this.logger.warn(
            `${config.phoneNumber} was logged out — not reconnecting. Re-pair required.`,
          );
        }
      }
    });

    const session: WhatsappSession = {
      tenantId: config.tenantId,
      phoneNumber: config.phoneNumber,
      numberId: config.numberId,
      socket,
      authState: state,
    };

    this.sessions.set(sessionKey, session);
    await this.repositoryAdapter.updateConnectionStatus(
      config.numberId,
      'PENDING_QR_SCAN',
    );

    return session;
  }

  private async reconnectSession(config: BaileysSessionConfig): Promise<void> {
    const sessionKey = this.getSessionKey(config.phoneNumber);
    this.sessions.delete(sessionKey);
    await this.registerSession(config);
  }

  getSessionByTenant(tenantId: string): WhatsappSession | undefined {
    return [...this.sessions.values()].find(
      (session) => session.tenantId === tenantId,
    );
  }

  async requestPairingCode(phoneNumber: string): Promise<string> {
    const sessionKey = this.getSessionKey(phoneNumber);
    const session = this.sessions.get(sessionKey);
    if (!session) {
      throw new Error('الجلسة غير مسجلة، يرجى تهيئة الرقم أولاً');
    }

    if (session.socket.authState.creds.registered) {
      return 'تم اقتران الرقم ومسجل بالفعل!';
    }

    const code = await session.socket.requestPairingCode(
      phoneNumber.replace(/[^0-9]/g, ''),
    );
    return code;
  }
}
