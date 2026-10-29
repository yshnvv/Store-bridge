import { Injectable, Logger } from '@nestjs/common';
import { OzonWebhookDto } from './dto/webhook.dto';
import { OzonNotificationPayload } from './dto/webhook.dto';
import { FulfillmentService } from '../fulfillment/fulfillment.service';

/**
 * Handles Ozon push notifications and triggers auto-fulfillment:
 *
 *   Ozon webhook → FulfillmentService → buy key from FazerCards → deliver to buyer
 */
@Injectable()
export class OzonService {
  private readonly logger = new Logger(OzonService.name);

  // In-memory dedup for demo only. Replace with Redis/DB in production.
  private readonly processedIds = new Set<string>();

  constructor(private readonly fulfillment: FulfillmentService) {}

  handleNotification(payload: OzonNotificationPayload): void {
    const eventType = payload.type ?? 'unknown';
    const postingNumber = payload.posting_number ?? 'n/a';

    // Idempotency: skip if we already processed this exact payload.
    const idempotencyKey = this.buildIdempotencyKey(payload);
    if (this.processedIds.has(idempotencyKey)) {
      this.logger.log(`Duplicate Ozon notification skipped: ${idempotencyKey}`);
      return;
    }
    this.processedIds.add(idempotencyKey);

    this.logger.log(
      `Received Ozon notification [type=${eventType}] [posting=${postingNumber}] [status=${payload.status}]`,
    );
    this.logger.debug(JSON.stringify(payload, null, 2));

    // Trigger auto-fulfillment asynchronously (fire-and-forget).
    // We still reply 200 to Ozon immediately in the controller.
    this.fulfillment
      .handleOzonPostingEvent(
        postingNumber,
        payload.status ?? '',
        (payload.data as Record<string, unknown> | undefined)?.offer_id as
          | string
          | undefined,
      )
      .catch((error) => {
        this.logger.error(
          `Fulfillment failed for posting ${postingNumber}`,
          (error as Error)?.stack ?? String(error),
        );
      });
  }

  private buildIdempotencyKey(payload: OzonNotificationPayload): string {
    return [
      payload.type ?? '',
      payload.posting_number ?? '',
      payload.status ?? '',
      payload.timestamp ?? '',
    ].join('|');
  }
}
