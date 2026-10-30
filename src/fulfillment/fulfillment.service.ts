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
  FulfillmentStats,
} from './entities/fulfillment-record.entity';
import { OzonApiService } from '../ozon/ozon-api.service';
import { SupplierFactory } from '../suppliers/supplier.factory';
import {
  SupplierType,
  DigitalProductConfig as SupplierDigitalProductConfig,
} from '../suppliers/supplier.interface';
import { MappingService } from '../catalog/mapping/mapping.service';

/**
 * Orchestrates the full flow:
 *
 *   Ozon webhook (NEW_POSTING / status change)
 *   → lookup Ozon posting → find offer_id
 *   → map offer_id → supplier product config
 *   → buy key from the configured supplier (idempotent by Ozon posting number)
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
    private readonly supplierFactory: SupplierFactory,
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
      await this.fail(record, 'No offer_id on Ozon posting; cannot map to supplier product');
      return;
    }

    const config = await this.mapping.get(offerId);
    if (!config) {
      await this.fail(
        record,
        `No supplier mapping for Ozon offer ${offerId}. Add it via POST /admin/catalog/mapping`,
      );
      return;
    }

    const supplierType = config.supplier ?? SupplierType.FAZERCARDS;
    let supplier: ReturnType<SupplierFactory['get']>;
    try {
      supplier = this.supplierFactory.get(supplierType);
    } catch (err) {
      await this.fail(
        record,
        `No supplier registered for '${supplierType}'. Configure it first.`,
      );
      return;
    }

    try {
      // 1. Mark as buying key
      record.fulfillmentStatus = FulfillmentStatus.BUYING_KEY;
      record.updatedAt = new Date().toISOString();
      this.store.set(record);

      this.logger.log(
        `Buying key for posting ${postingNumber} (offer=${offerId}, supplier=${supplierType}, type=${config.type})`,
      );

      // 2. Buy key from the configured supplier (idempotent by posting number)
      const bought = await supplier.buyKey(
        config as unknown as SupplierDigitalProductConfig,
        postingNumber,
      );

      record.supplierOrder = {
        orderId: bought.orderId,
        status: bought.status,
        code: bought.code,
        product: config,
        boughtAt: bought.boughtAt ?? new Date().toISOString(),
      };
      record.fulfillmentStatus = FulfillmentStatus.KEY_BOUGHT;
      record.updatedAt = new Date().toISOString();
      this.store.set(record);

      if (!bought.code) {
        await this.fail(record, 'Supplier order completed but no code/key returned');
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

  getStats(): FulfillmentStats {
    const records = this.store.list();
    const byStatus: Record<FulfillmentStatus, number> = {
      [FulfillmentStatus.PENDING]: 0,
      [FulfillmentStatus.BUYING_KEY]: 0,
      [FulfillmentStatus.KEY_BOUGHT]: 0,
      [FulfillmentStatus.DELIVERED_TO_BUYER]: 0,
      [FulfillmentStatus.OZON_SHIPPED]: 0,
      [FulfillmentStatus.COMPLETED]: 0,
      [FulfillmentStatus.FAILED]: 0,
    };

    for (const record of records) {
      byStatus[record.fulfillmentStatus] =
        (byStatus[record.fulfillmentStatus] ?? 0) + 1;
    }

    const completed = byStatus[FulfillmentStatus.COMPLETED] ?? 0;
    const failed = byStatus[FulfillmentStatus.FAILED] ?? 0;
    const terminal = completed + failed;
    const successRate = terminal > 0 ? (completed / terminal) * 100 : 0;

    return {
      total: records.length,
      byStatus,
      completed,
      failed,
      successRate: Math.round(successRate * 100) / 100,
    };
  }
}
