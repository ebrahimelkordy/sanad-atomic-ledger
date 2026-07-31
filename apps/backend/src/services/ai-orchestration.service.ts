import { Injectable, Logger } from '@nestjs/common';
import {
  ClassifyAndExtractResult,
  TenantAIContext,
  ProcessChatResult,
} from '../ai-orchestrator/ai-provider.interface';
import { AIProviderFactory } from '../ai-orchestrator/ai-provider.factory';

/**
 * Sole entry point for AI classification/extraction in the app.
 * No other service may call model SDKs directly.
 */
@Injectable()
export class AIOrchestrationService {
  private readonly logger = new Logger(AIOrchestrationService.name);

  constructor(private readonly aiProviderFactory: AIProviderFactory) {}

  async classifyAndExtract(
    messageText: string,
    tenantContext: TenantAIContext,
  ): Promise<ClassifyAndExtractResult> {
    const primary = this.aiProviderFactory.getAIProvider();
    try {
      return await primary.classifyAndExtract(messageText, tenantContext);
    } catch (err) {
      this.logger.error(
        `Primary AI provider failed: ${(err as Error).message}`,
        (err as Error).stack,
      );

      try {
        const gemini = this.aiProviderFactory.getAIProvider('gemini');
        if (primary !== gemini) {
          this.logger.log('Attempting fallback to Gemini');
          return await gemini.classifyAndExtract(messageText, tenantContext);
        }
      } catch (geminiErr) {
        this.logger.error(
          `Fallback Gemini failed: ${(geminiErr as Error).message}`,
          (geminiErr as Error).stack,
        );
      }

      const local = this.aiProviderFactory.getAIProvider('local');
      if (primary !== local) {
        this.logger.log('Attempting fallback to Local Model');
        return await local.classifyAndExtract(messageText, tenantContext);
      }

      throw err;
    }
  }

  async processChat(
    messageText: string,
    tenantContext: TenantAIContext,
    attachments?: Array<{ mimeType: string; base64Data: string }>,
  ): Promise<ProcessChatResult> {
    const primary = this.aiProviderFactory.getAIProvider();
    try {
      return await primary.processChat(messageText, tenantContext, attachments);
    } catch (err) {
      this.logger.error(
        `Primary provider processChat failed: ${(err as Error).message}`,
      );

      // Try Gemini as fallback (has vision support)
      try {
        const gemini = this.aiProviderFactory.getAIProvider('gemini');
        if (primary !== gemini) {
          this.logger.log('Attempting processChat fallback to Gemini');
          return await gemini.processChat(messageText, tenantContext, attachments);
        }
      } catch (geminiErr) {
        this.logger.error(
          `Gemini processChat fallback failed: ${(geminiErr as Error).message}`,
        );
      }

      // Try OpenAI as last resort
      try {
        const openai = this.aiProviderFactory.getAIProvider('openai');
        if (primary !== openai) {
          this.logger.log('Attempting processChat fallback to OpenAI');
          return await openai.processChat(messageText, tenantContext, attachments);
        }
      } catch (openaiErr) {
        this.logger.error(
          `OpenAI processChat fallback failed: ${(openaiErr as Error).message}`,
        );
      }

      return {
        intent: 'UNKNOWN',
        extractedData: {},
        reply: 'عذراً، حدث خطأ في معالجة رسالتك. يرجى المحاولة مرة أخرى.',
        requiresConfirmation: false,
      };
    }
  }
}
