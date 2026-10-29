import { IsString, IsOptional, IsObject, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum FzrWebhookEvent {
  ORDER_CREATED = 'order.created',
  ORDER_STATUS_CHANGED = 'order.status_changed',
  MANUAL_SERVICE_CHAT_MESSAGE = 'manual_service.chat.message',
  MANUAL_SERVICE_CHAT_WAITING_REPLY = 'manual_service.chat.waiting_reply',
  WEBHOOK_TEST = 'webhook.test',
}

export interface FzrOrderData {
  id?: string;
  kind?: string;
  status?: string;
  customer_email?: string;
  products?: Array<{
    sku?: string;
    name?: string;
    code?: string;
    value?: number;
    currency?: string;
  }>;
  amount?: number;
  currency?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface FzrWebhookEventPayload {
  event: FzrWebhookEvent | string;
  event_id: string;
  timestamp: string;
  data: FzrOrderData;
}

export class FzrWebhookDto {
  @IsString()
  event: string;

  @IsString()
  event_id: string;

  @IsString()
  timestamp: string;

  @IsObject()
  @Type(() => Object)
  data: Record<string, unknown>;
}
