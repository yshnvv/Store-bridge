import { Request } from 'express';
import { FzrWebhookEventPayload } from '../../fazercards/dto/webhook.dto';

export interface RequestWithFzrEvent extends Request {
  fzrEvent?: FzrWebhookEventPayload;
}
