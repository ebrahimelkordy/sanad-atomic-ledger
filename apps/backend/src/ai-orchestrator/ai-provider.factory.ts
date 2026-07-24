import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIProvider } from './ai-provider.interface';
import { GeminiProvider } from './gemini.provider';
import { OpenAIProvider } from './openai.provider';
import { LocalModelProvider } from './local-model.provider';

@Injectable()
export class AIProviderFactory {
  constructor(
    private readonly config: ConfigService,
    private readonly gemini: GeminiProvider,
    private readonly openai: OpenAIProvider,
    private readonly local: LocalModelProvider,
  ) {}

  getAIProvider(providerName?: string): AIProvider {
    const name = (
      providerName ?? this.config.get<string>('AI_PROVIDER', 'local')
    ).toLowerCase();

    switch (name) {
      case 'gemini':
        return this.gemini;
      case 'openai':
        return this.openai;
      case 'local':
        return this.local;
      default:
        return this.local;
    }
  }
}
