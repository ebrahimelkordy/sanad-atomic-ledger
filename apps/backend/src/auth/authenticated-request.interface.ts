import { AuthenticatedPrincipal } from '../domain/identity/principal';
import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  principal: AuthenticatedPrincipal;
  traceId: string;
  ip: string;
  userAgent?: string;
}
