import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Extends FzrService to buy digital keys from FazerCards.
 *
 * Uses the official fazercards SDK:
 *   giftcards.order({ categoryId, cardId, quantity }) → POST /giftcards/order
 *   gamekeys.order({ gameId, keyId, quantity })      → POST /gamekeys/order
 *   orders.wait(orderId)                             → polls until terminal
 *
 * The idempotency key is set to the Ozon posting number so re-sending the
 * same Ozon webhook does not buy the key twice.
 */
@Injectable()
export class FazerCardsBuyService {
  private readonly logger = new Logger(FazerCardsBuyService.name);
  private fz: any;

  constructor(private readonly configService: ConfigService) {}

  private getClient(): any {
    if (this.fz) return this.fz;
    const apiKey = this.configService.get<string>('app.fzApiKey');
    if (!apiKey) {
      throw new Error('FZ_API_KEY is not configured');
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fazercards = require('fazercards');
    this.fz = new fazercards.FazerCardsClient({ apiKey });
    return this.fz;
  }

  /**
   * Buy a digital key from FazerCards.
   * Returns { orderId, status, code } once the order reaches a terminal state.
   */
  async buyKey(config: {
    type: 'giftcard' | 'gamekey' | 'topup' | 'steam' | 'telegram';
    categoryId?: string;
    cardId?: string;
    gameId?: string;
    keyId?: string;
    quantity?: number;
    idempotencyKey: string;
  }): Promise<{ orderId: string; status: string; code?: string; raw: any }> {
    const fz = this.getClient();
    const idempotencyKey = config.idempotencyKey;

    let order: any;

    if (config.type === 'giftcard' || config.type === 'topup') {
      order = await fz.giftcards.order(
        {
          categoryId: config.categoryId!,
          cardId: config.cardId!,
          quantity: config.quantity ?? 1,
          idempotencyKey,
        },
        { idempotencyKey },
      );
    } else if (config.type === 'gamekey') {
      order = await fz.gamekeys.order(
        {
          gameId: config.gameId!,
          keyId: config.keyId!,
          quantity: config.quantity ?? 1,
          idempotencyKey,
        },
        { idempotencyKey },
      );
    } else {
      throw new Error(`Unsupported FazerCards product type: ${config.type}`);
    }

    const orderId = order.id ?? order.order_id ?? order.id;
    this.logger.log(
      `FazerCards order created: ${orderId} (idempotency=${idempotencyKey})`,
    );

    // Wait until terminal status (fulfilled / delivered / failed / cancelled)
    const waited = await fz.orders.wait(orderId, { timeoutMs: 300_000 });
    const code = this.extractCode(waited);

    this.logger.log(
      `FazerCards order ${orderId} terminal: ${waited.status}, code=${code ? 'present' : 'missing'}`,
    );

    return {
      orderId: String(orderId),
      status: waited.status,
      code,
      raw: waited,
    };
  }

  private extractCode(order: any): string | undefined {
    // FazerCards may put the delivered code in different fields depending on product type.
    return (
      order.code ??
      order.key ??
      order.delivery_code ??
      order.products?.[0]?.code ??
      order.products?.[0]?.key ??
      order.data?.code
    );
  }
}
