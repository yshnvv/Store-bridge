import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FzrWebhookEventPayload } from './dto/webhook.dto';

/**
 * Business logic for FazerCards digital-product webhooks.
 *
 * Events:
 *   - order.created        -> customer bought a digital product (processing)
 *   - order.status_changed -> status moved (processing -> fulfilled/delivered)
 *
 * Digital goods are usually auto-delivered by FazerCards; handle the status
 * change to handed the code/key to your buyer.
 */
@Injectable()
export class FzrWebhookHandler implements OnModuleInit {
  private readonly logger = new Logger(FzrWebhookHandler.name);

  // In-memory dedup for demo only. Replace with Redis/DB in production.
  private readonly processedEventIds = new Set<string>();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.logger.log('FazerCards webhook handler initialized');
  }

  handle(event: FzrWebhookEventPayload): void {
    if (this.processedEventIds.has(event.event_id)) {
      this.logger.log(`Duplicate FazerCards event skipped: ${event.event_id}`);
      return;
    }
    this.processedEventIds.add(event.event_id);

    const { event: type, data } = event;
    this.logger.log(
      `Processing FazerCards event [${type}] order=${data.id} status=${data.status}`,
    );
    this.logger.debug(JSON.stringify(event, null, 2));

    switch (type) {
      case 'order.created':
        this.onOrderCreated(data);
        break;
      case 'order.status_changed':
        this.onOrderStatusChanged(data);
        break;
      case 'webhook.test':
        this.logger.log('FazerCards webhook test received');
        break;
      default:
        this.logger.log(`Unhandled FazerCards event type: ${type}`);
    }
  }

  private onOrderCreated(data: any): void {
    this.logger.log(`FazerCards order created: ${data.id} (${data.kind})`);
  }

  private onOrderStatusChanged(data: any): void {
    this.logger.log(
      `FazerCards order status changed: ${data.id} -> ${data.status}`,
    );
    if (data.status === 'fulfilled' || data.status === 'delivered') {
      this.fulfillDigitalOrder(data);
    }
  }

  private fulfillDigitalOrder(data: any): void {
    const codes = data.products
      ?.map((p: any) => p.code)
      .filter(Boolean);
    this.logger.log(
      `Fulfilling digital order ${data.id}; codes: ${JSON.stringify(codes)}`,
    );
    // TODO: deliver codes to your buyer via your own channel
  }
}
