import { IsString, IsOptional, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export class OzonWebhookDto {
  @IsString()
  @IsOptional()
  type?: string; // e.g. NEW_POSTING, POSTING_STATUS_CHANGED

  @IsString()
  @IsOptional()
  posting_number?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsObject()
  @IsOptional()
  @Type(() => Object)
  data?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  @Type(() => Object)
  raw?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  timestamp?: string;
}

export interface OzonNotificationPayload {
  type?: string;
  posting_number?: string;
  status?: string;
  data?: Record<string, unknown>;
  raw?: Record<string, unknown>;
  timestamp?: string;
}
