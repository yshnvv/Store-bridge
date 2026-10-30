import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BuyResult,
  DigitalCatalogItem,
  DigitalProductConfig,
  DigitalProductSupplier,
  SupplierType,
} from '../supplier.interface';
import { FazerCardsBuyService } from '../../fazercards/fazercards-buy.service';
import { FzrService } from '../../fazercards/fazercards.service';

/**
 * FazerCards implementation of DigitalProductSupplier.
 *
 * Delegates buying to FazerCardsBuyService and catalog reads to
 * the FazerCards SDK order history (fz.orders.iterAll).
 */
@Injectable()
export class FazerCardsSupplierService
  implements DigitalProductSupplier
{
  readonly supplier = SupplierType.FAZERCARDS;
  private readonly logger = new Logger(FazerCardsSupplierService.name);

  constructor(
    private readonly buyService: FazerCardsBuyService,
    private readonly fzrService: FzrService,
    private readonly configService: ConfigService,
  ) {}

  async fetchCatalog(
    options?: { maxOrders?: number },
  ): Promise<DigitalCatalogItem[]> {
    const fz = this.fzrService.getClient();
    const items: DigitalCatalogItem[] = [];
    const seen = new Set<string>();
    let ordersScanned = 0;

    for await (const order of fz.orders.iterAll({ limit: 50 })) {
      ordersScanned++;
      if (ordersScanned > (options?.maxOrders ?? 500)) break;

      // Only delivered orders represent a purchased article.
      if (order.status !== 'completed') continue;

      const dedupeKey = `${order.kind}:${order.category_id ?? ''}:${order.card_id ?? ''}:${order.key_id ?? ''}:${order.offer_id ?? ''}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      let type: string;
      let categoryId: string | undefined;
      let cardId: string | undefined;
      let gameId: string | undefined;
      let keyId: string | undefined;
      let name: string | undefined;

      switch (order.kind) {
        case 'gift_card':
          type = 'giftcard';
          categoryId = order.category_id;
          cardId = order.card_id;
          name =
            order.title ??
            order.offer_name ??
            order.category_name ??
            order.id;
          break;
        case 'topup':
          type = 'topup';
          categoryId = order.category_id;
          name =
            order.title ??
            order.offer_name ??
            order.category_name ??
            order.id;
          break;
        case 'game_key':
          type = 'gamekey';
          keyId = order.key_id;
          // OrderResource does not carry game_id — left undefined.
          name = order.title ?? order.offer_name ?? order.id;
          break;
        default:
          continue;
      }

      const catalogId =
        type === 'topup'
          ? `${categoryId}:${order.offer_id ?? order.id}`
          : type === 'gamekey'
            ? `${gameId ?? order.id}:${keyId ?? order.id}`
            : `${categoryId}:${cardId ?? order.id}`;

      items.push({
        supplier: SupplierType.FAZERCARDS,
        id: catalogId,
        name,
        type,
        config: {
          categoryId,
          cardId,
          gameId,
          keyId,
        },
      });
    }

    this.logger.log(
      `Fetched ${items.length} FazerCards purchased articles from ${ordersScanned} orders`,
    );
    return items;
  }

  async buyKey(
    config: DigitalProductConfig,
    idempotencyKey: string,
  ): Promise<BuyResult> {
    this.logger.log(
      `Buying FazerCards key for config type=${config.type} (idempotency=${idempotencyKey})`,
    );

    const bought = await this.buyService.buyKey({
      type: config.type as
        | 'giftcard'
        | 'gamekey'
        | 'topup'
        | 'steam'
        | 'telegram',
      categoryId: config.config?.categoryId as string | undefined,
      cardId: config.config?.cardId as string | undefined,
      gameId: config.config?.gameId as string | undefined,
      keyId: config.config?.keyId as string | undefined,
      quantity: config.quantity ?? 1,
      idempotencyKey,
    });

    return {
      orderId: bought.orderId,
      status: bought.status,
      code: bought.code,
      boughtAt: new Date().toISOString(),
      raw: bought.raw,
    };
  }
}
