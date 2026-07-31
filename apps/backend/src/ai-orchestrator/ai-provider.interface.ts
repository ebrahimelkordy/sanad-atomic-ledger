export type AIIntent = 'ORDER' | 'SETTLEMENT' | 'UNKNOWN';

export type TenantAIContext = {
  verticalType: string;
  tenantId: string;
};

export type ClassifyAndExtractResult = {
  intent: AIIntent;
  extractedData: Record<string, unknown>;
};

export type ProcessChatResult = {
  intent: string;
  extractedData: Record<string, unknown>;
  reply: string;
  requiresConfirmation: boolean;
};

/**
 * Only implementors allowed to talk to model SDKs (step 08).
 * Callers must go through `AIOrchestrationService.classifyAndExtract`.
 */
export interface AIProvider {
  classifyAndExtract(
    messageText: string,
    tenantContext: TenantAIContext,
  ): Promise<ClassifyAndExtractResult>;

  processChat(
    messageText: string,
    tenantContext: TenantAIContext,
    attachments?: Array<{ mimeType: string; base64Data: string }>,
  ): Promise<ProcessChatResult>;
}
