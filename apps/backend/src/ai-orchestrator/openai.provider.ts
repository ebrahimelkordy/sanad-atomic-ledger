import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  AIProvider,
  ClassifyAndExtractResult,
  TenantAIContext,
} from './ai-provider.interface';

@Injectable()
export class OpenAIProvider implements AIProvider {
  private readonly logger = new Logger(OpenAIProvider.name);
  private openai: OpenAI;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY') || '';
    this.openai = new OpenAI({ apiKey });
  }

  async classifyAndExtract(
    messageText: string,
    tenantContext: TenantAIContext,
  ): Promise<ClassifyAndExtractResult> {
    const systemPrompt = `You are an AI assistant for a business of type: ${tenantContext.verticalType}.
Analyze the following WhatsApp message from a customer or manager.
Classify the intent into one of three categories: "ORDER", "SETTLEMENT", or "UNKNOWN".

If the intent is "ORDER", extract the items requested.
If the intent is "SETTLEMENT", extract the party identifier (name or phone), the entry type ("CREDIT" or "DEBIT"), and the amount.

Return ONLY a JSON object with the following schema:
{
  "intent": "ORDER" | "SETTLEMENT" | "UNKNOWN",
  "extractedData": {
    // If ORDER:
    "items": [{"productNameOrSku": "string", "quantity": 1}]
    // If SETTLEMENT:
    "partyIdentifier": "string",
    "entryType": "CREDIT" | "DEBIT",
    "amount": 0
  }
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: messageText },
        ],
        response_format: { type: 'json_object' },
      });

      const responseText = response.choices[0].message.content || '{}';
      const parsed = JSON.parse(responseText) as ClassifyAndExtractResult;
      return parsed;
    } catch (error) {
      this.logger.error('Failed to classify message using OpenAI', error);
      return { intent: 'UNKNOWN', extractedData: {} };
    }
  }
}
