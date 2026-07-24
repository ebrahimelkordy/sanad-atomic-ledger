export type AIIntent = 'ORDER' | 'SETTLEMENT' | 'UNKNOWN';

export type TenantAIContext = {
  verticalType: string;
  tenantId: string;
};

export type ClassifyAndExtractResult = {
  intent: AIIntent;
  extractedData: Record<string, unknown>;
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
}
