import { Injectable, Logger } from '@nestjs/common';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import type { AuthenticationState } from '@whiskeysockets/baileys';
import { SessionRepositoryAdapter } from './session.repository-adapter';
import type { ConnectionStatus } from '../repositories/tenant-whatsapp-number.repository';

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

  constructor(private readonly repositoryAdapter: SessionRepositoryAdapter) {}

  private getSessionKey(phoneNumber: string): string {
    return phoneNumber;
  }

  private async createAuthState(
    fileName: string,
  ): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
    return useMultiFileAuthState(fileName);
  }

  async registerSession(
    config: BaileysSessionConfig,
  ): Promise<WhatsappSession> {
    const sessionKey = this.getSessionKey(config.phoneNumber);

    if (this.sessions.has(sessionKey)) {
      return this.sessions.get(sessionKey) as WhatsappSession;
    }

    const authFolder = `./baileys-auth-${config.phoneNumber.replace(/[^0-9]/g, '')}`;
    const { state, saveCreds } = await this.createAuthState(authFolder);

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
          setTimeout(() => {
            void this.reconnectSession(config);
          }, 5000);
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

    const code = await session.socket.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
    return code;
  }
}
