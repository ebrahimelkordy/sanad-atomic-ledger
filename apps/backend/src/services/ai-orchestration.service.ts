import { Injectable, Logger } from '@nestjs/common';
import {
  ClassifyAndExtractResult,
  TenantAIContext,
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
}
