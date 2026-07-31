import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: {
    tenant_id: string;
    user_id?: string;
  };
}
