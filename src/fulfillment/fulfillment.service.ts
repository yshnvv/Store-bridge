import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FulfillmentStore, fulfillmentStore } from './fulfillment.store';
import {
  OzonFulfillmentRecord,
  FulfillmentStatus,
} from './entities/fulfillment-record.entity';
import { OzonApiService } from '../ozon/ozon-api.service';
import { FazerCardsBuyService } from '../fazercards/fazercards-buy.service';
import { MappingService } from '../catalog/mapping/mapping.service';

/**
 * Orchestrates the full flow:
 *
 *   Ozon webhook (NEW_POSTING / status change)
 *   → lookup Ozon posting → find offer_id
 *   → map offer_id → FazerCards product
 *   → buy key from FazerCards (idempotent by Ozon posting number)
 *   → deliver key to Ozon buyer (Ozon chat message + ship posting)
 *   → mark Ozon posting shipped / delivered
 *
 * Records every step in FulfillmentStore for observability and idempotency.
 */
@Injectable()
export class FulfillmentService implements OnModuleInit {
  private readonly logger = new Logger(FulfillmentService.name);

  constructor(
    private readonly store: FulfillmentStore,
    private readonly ozonApi: OzonApiService,
    private readonly fzrBuy: FazerCardsBuyService,
    private readonly mapping: MappingService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    this.logger.log('Fulfillment service initialized');
  }

  /**
   * Entry point called from the Ozon webhook handler.
   * Idempotent: safe to call multiple times for the same posting.
   */
  async handleOzonPostingEvent(
    postingNumber: string,
    ozonStatus: string,
    offerId?: string,
  ): Promise<void> {
    let record = this.store.get(postingNumber);

    if (!record) {
      record = {
        ozonPostingNumber: postingNumber,
        ozonOfferId: offerId,
        ozonStatus,
        fulfillmentStatus: FulfillmentStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.store.set(record);
    } else {
      record.ozonStatus = ozonStatus;
      record.updatedAt = new Date().toISOString();
    }

    // Only auto-fulfill on new/processing statuses. If already completed, skip.
    if (
      record.fulfillmentStatus === FulfillmentStatus.COMPLETED ||
      record.fulfillmentStatus === FulfillmentStatus.FAILED
    ) {
      this.logger.log(
        `Posting ${postingNumber} already ${record.fulfillmentStatus}, skipping`,
      );
      return;
    }

    // Determine if we should auto-buy: NEW_POSTING or awaiting_packaging/processing
    const shouldFulfill =
      ozonStatus === 'awaiting_packaging' ||
      ozonStatus === 'processing' ||
      ozonStatus === 'new' ||
      !ozonStatus;

    if (!shouldFulfill) {
      this.logger.log(
        `Posting ${postingNumber} status ${ozonStatus} does not trigger fulfillment yet`,
      );
      this.store.set(record);
      return;
    }

    await this.fulfill(record);
  }

  private async fulfill(record: OzonFulfillmentRecord): Promise<void> {
    const postingNumber = record.ozonPostingNumber;
    const offerId = record.ozonOfferId;

    if (!offerId) {
      await this.fail(record, 'No offer_id on Ozon posting; cannot map to FazerCards product');
      return;
    }

    const fazercardsConfig = await this.mapping.get(offerId);
    if (!fazercardsConfig) {
      await this.fail(
        record,
        `No FazerCards mapping for Ozon offer ${offerId}. Add it via POST /admin/catalog/mapping`,
      );
      return;
    }

    try {
      // 1. Mark as buying key
      record.fulfillmentStatus = FulfillmentStatus.BUYING_KEY;
      record.updatedAt = new Date().toISOString();
      this.store.set(record);

      this.logger.log(
        `Buying key for posting ${postingNumber} (offer=${offerId}, type=${fazercardsConfig.type})`,
      );

      // 2. Buy key from FazerCards (idempotent by posting number)
      const bought = await this.fzrBuy.buyKey({
        type: fazercardsConfig.type,
        categoryId: fazercardsConfig.categoryId,
        cardId: fazercardsConfig.cardId,
        gameId: fazercardsConfig.gameId,
        keyId: fazercardsConfig.keyId,
        quantity: fazercardsConfig.quantity ?? 1,
        idempotencyKey: postingNumber,
      });

      record.fazercardsOrder = {
        orderId: bought.orderId,
        status: bought.status,
        code: bought.code,
        product: fazercardsConfig,
        boughtAt: new Date().toISOString(),
      };
      record.fulfillmentStatus = FulfillmentStatus.KEY_BOUGHT;
      record.updatedAt = new Date().toISOString();
      this.store.set(record);

      if (!bought.code) {
        await this.fail(record, 'FazerCards order completed but no code/key returned');
        return;
      }

      // 3. Deliver key to Ozon buyer
      await this.deliverKeyToOzonBuyer(record, bought.code);

      // 4. Mark completed
      record.fulfillmentStatus = FulfillmentStatus.COMPLETED;
      record.keyDeliveredAt = new Date().toISOString();
      record.updatedAt = new Date().toISOString();
      this.store.set(record);

      this.logger.log(
        `Fulfillment COMPLETED for posting ${postingNumber}, key delivered`,
      );
    } catch (error) {
      await this.fail(
        record,
        (error as Error)?.message ?? String(error),
      );
    }
  }

  private async deliverKeyToOzonBuyer(
    record: OzonFulfillmentRecord,
    key: string,
  ): Promise<void> {
    const postingNumber = record.ozonPostingNumber;
    this.logger.log(`Delivering key to Ozon buyer for posting ${postingNumber}`);

    // Option A: Ship the Ozon posting with the key as the tracking number.
    // For digital goods, many sellers put the key/code in the tracking_number field
    // so the buyer sees it on their order page.
    try {
      await this.ozonApi.shipPosting(postingNumber, key);
      record.ozonShippedAt = new Date().toISOString();
      this.logger.log(`Ozon posting ${postingNumber} shipped with key as tracking`);
    } catch (err) {
      this.logger.warn(
        `Failed to ship Ozon posting ${postingNumber} (continuing to chat message): ${(err as Error)?.message}`,
      );
    }

    // Option B: Send the key via Ozon chat message.
    // This requires starting a chat with the buyer first. Uncomment and wire up
    // once you have the order_id / chat flow working with Ozon API.
    /*
    try {
      const chat = await this.ozonApi.startChat(record.ozonOrderId ?? '');
      if (chat.chat_id) {
        await this.ozonApi.sendMessage(
          chat.chat_id,
          `Your digital key: ${key}\n\nThank you for your purchase!`,
        );
        this.logger.log(`Key sent via Ozon chat for posting ${postingNumber}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to send Ozon chat message: ${(err as Error)?.message}`);
    }
    */

    record.fulfillmentStatus = FulfillmentStatus.DELIVERED_TO_BUYER;
    record.updatedAt = new Date().toISOString();
    this.store.set(record);
  }

  private async fail(
    record: OzonFulfillmentRecord,
    reason: string,
  ): Promise<void> {
    record.fulfillmentStatus = FulfillmentStatus.FAILED;
    record.error = reason;
    record.updatedAt = new Date().toISOString();
    this.store.set(record);
    this.logger.error(
      `Fulfillment FAILED for posting ${record.ozonPostingNumber}: ${reason}`,
    );
  }

  getRecord(postingNumber: string): OzonFulfillmentRecord | undefined {
    return this.store.get(postingNumber);
  }

  listRecords(): OzonFulfillmentRecord[] {
    return this.store.list();
  }
}
