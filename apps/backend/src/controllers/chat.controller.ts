import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService, ChatAttachment } from '../services/chat.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request.interface';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('history')
  async getHistory(@Req() req: AuthenticatedRequest) {
    const tenantId = req.principal.tenantId;
    return this.chatService.getHistory(tenantId);
  }

  @Post('message')
  async sendMessage(
    @Req() req: AuthenticatedRequest,
    @Body('message') message: string,
    @Body('attachments') attachments?: ChatAttachment[],
  ) {
    const tenantId = req.principal.tenantId;
    const tenantContext = {
      tenantId,
      verticalType: 'RETAIL_WHOLESALE',
    };

    return this.chatService.processMessage(
      tenantId,
      message || '',
      tenantContext,
      attachments,
    );
  }

  @Post('confirm')
  async confirmAction(
    @Req() req: AuthenticatedRequest,
    @Body('actionType') actionType: string,
    @Body('actionData') actionData: Record<string, unknown>,
    @Body('msgId') msgId?: string,
  ) {
    const tenantId = req.principal.tenantId;
    const requestedBy = req.principal.userId || req.principal.tenantId;

    return this.chatService.confirmAction(
      tenantId,
      actionType,
      actionData,
      requestedBy,
      msgId,
    );
  }
}

