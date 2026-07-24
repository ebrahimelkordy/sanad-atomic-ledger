import { Module } from '@nestjs/common';
import { AIProviderFactory } from './ai-provider.factory';
import { GeminiProvider } from './gemini.provider';
import { OpenAIProvider } from './openai.provider';
import { LocalModelProvider } from './local-model.provider';
import { AIOrchestrationService } from '../services/ai-orchestration.service';

@Module({
  providers: [
    AIProviderFactory,
    GeminiProvider,
    OpenAIProvider,
    LocalModelProvider,
    AIOrchestrationService,
  ],
  exports: [AIOrchestrationService],
})
export class AiOrchestratorModule {}
