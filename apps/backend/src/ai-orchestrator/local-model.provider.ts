import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIProvider,
  ClassifyAndExtractResult,
  TenantAIContext,
} from './ai-provider.interface';

@Injectable()
export class LocalModelProvider implements AIProvider {
  private readonly logger = new Logger(LocalModelProvider.name);
  private endpoint: string;

  constructor(private readonly config: ConfigService) {
    this.endpoint =
      this.config.get<string>('LOCAL_MODEL_ENDPOINT') ||
      'http://localhost:11434/api/generate';
  }

  async classifyAndExtract(
    messageText: string,
    tenantContext: TenantAIContext,
  ): Promise<ClassifyAndExtractResult> {
    const prompt = `You are an AI assistant for a business of type: ${tenantContext.verticalType}.
Analyze the following WhatsApp message from a customer or manager.
Classify the intent into one of three categories: "ORDER", "SETTLEMENT", or "UNKNOWN".

If the intent is "ORDER", extract the items requested.
If the intent is "SETTLEMENT", extract the party identifier (name or phone), the entry type ("CREDIT" or "DEBIT"), and the amount.

Return ONLY a JSON object with the following schema:
{
  "intent": "ORDER" | "SETTLEMENT" | "UNKNOWN",
  "extractedData": {
    "items": [{"productNameOrSku": "string", "quantity": 1}],
    "partyIdentifier": "string",
    "entryType": "CREDIT",
    "amount": 0
  }
}

Message: "${messageText}"`;

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.get<string>('LOCAL_MODEL_NAME') || 'llama3',
          prompt,
          format: 'json',
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as { response: string };
      const parsed = JSON.parse(data.response) as ClassifyAndExtractResult;
      return parsed;
    } catch (error) {
      this.logger.error(
        'Failed to classify message using Local Model, falling back to heuristics',
        error,
      );
      return this.heuristicFallback(messageText);
    }
  }

  private heuristicFallback(messageText: string): ClassifyAndExtractResult {
    const text = messageText.trim();
    const lower = text.toLowerCase();

    const settlementHint =
      lower.includes('debit') ||
      lower.includes('credit') ||
      text.includes('مدين') ||
      text.includes('دائن') ||
      text.includes('تسوية') ||
      text.includes('سداد');

    if (settlementHint) {
      return {
        intent: 'SETTLEMENT',
        extractedData: {
          partyIdentifier: '',
          entryType: 'CREDIT',
          amount: 0,
        },
      };
    }

    const orderHint =
      lower.includes('طلب') ||
      lower.includes('اوردر') ||
      lower.includes('order') ||
      lower.includes('عايز') ||
      lower.includes('أريد');

    if (orderHint) {
      return {
        intent: 'ORDER',
        extractedData: {
          items: [] as Array<{ productNameOrSku: string; quantity: number }>,
        },
      };
    }

    return { intent: 'UNKNOWN', extractedData: {} };
  }
}
