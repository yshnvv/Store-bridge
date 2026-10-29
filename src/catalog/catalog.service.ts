import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OzonApiService } from '../ozon/ozon-api.service';
import { FzrService } from '../fazercards/fazercards.service';

export interface OzonProductSummary {
  offer_id: string;
  product_id?: string;
  name?: string;
  price?: number;
  currency_code?: string;
}

export interface FazercardsCatalogItem {
  type: 'giftcard' | 'gamekey' | 'topup' | 'steam' | 'telegram';
  id: string;
  name?: string;
  categoryId?: string;
  cardId?: string;
  gameId?: string;
  keyId?: string;
  value?: number;
  currency?: string;
  raw: any;
}

/**
 * Fetches live catalogs from Ozon and FazerCards.
 *
 * Used by the admin UI so a human can pick which Ozon offer_id maps to
 * which FazerCards product. The actual mapping is stored in MappingService.
 */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly ozonApi: OzonApiService,
    private readonly fzrService: FzrService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Fetch all Ozon products (offers).
   * Returns a flattened list of { offer_id, product_id, name, price }.
   */
  async getOzonProducts(): Promise<OzonProductSummary[]> {
    try {
      const resp = await this.ozonApi.listProducts();
      const items = resp.result?.items ?? resp?.result ?? [];
      const products: OzonProductSummary[] = [];

      // Ozon v4/product/info returns items keyed by product_id/offer_id
      if (Array.isArray(items)) {
        for (const item of items) {
          const it = item as Record<string, unknown>;
          products.push({
            offer_id: String(it.offer_id ?? ''),
            product_id: String(it.product_id ?? ''),
            name: String(it.name ?? ''),
            price: Number(it.price ?? 0),
            currency_code: String(it.currency_code ?? ''),
          });
        }
      } else if (items && typeof items === 'object') {
        for (const [productId, item] of Object.entries(items)) {
          const it = item as Record<string, unknown>;
          const offerId = String(it.offer_id ?? productId);
          products.push({
            offer_id: offerId,
            product_id: productId,
            name: String(it.name ?? ''),
            price: Number(it.price ?? 0),
            currency_code: String(it.currency_code ?? ''),
          });
        }
      }

      this.logger.log(`Fetched ${products.length} Ozon products`);
      return products;
    } catch (err) {
      this.logger.error('Failed to fetch Ozon products', (err as Error)?.stack);
      throw err;
    }
  }

  /**
   * Fetch FazerCards gift card catalog.
   */
  async getFzrGiftcards(): Promise<FazercardsCatalogItem[]> {
    try {
      const fz = this.fzrService.getClient();
      const [categories, cards] = await Promise.all([
        fz.giftcards.categories(),
        fz.giftcards.cards(),
      ]);

      const items: FazercardsCatalogItem[] = [];
      const cardList = Array.isArray(cards) ? cards : cards?.cards ?? [];

      for (const card of cardList) {
        items.push({
          type: 'giftcard',
          id: card.id ?? card.card_id,
          name: card.name,
          categoryId: card.category_id,
          cardId: card.id ?? card.card_id,
          value: card.value,
          currency: card.currency,
          raw: card,
        });
      }

      this.logger.log(`Fetched ${items.length} FazerCards gift cards`);
      return items;
    } catch (err) {
      this.logger.error(
        'Failed to fetch FazerCards gift cards',
        (err as Error)?.stack,
      );
      throw err;
    }
  }

  /**
   * Fetch FazerCards game key catalog.
   */
  async getFzrGameKeys(): Promise<FazercardsCatalogItem[]> {
    try {
      const fz = this.fzrService.getClient();
      const [games, keys] = await Promise.all([
        fz.gamekeys.games(),
        fz.gamekeys.keys(),
      ]);

      const items: FazercardsCatalogItem[] = [];
      const keyList = Array.isArray(keys) ? keys : keys?.keys ?? [];

      for (const key of keyList) {
        items.push({
          type: 'gamekey',
          id: key.id ?? key.key_id,
          name: key.name,
          gameId: key.game_id,
          keyId: key.id ?? key.key_id,
          raw: key,
        });
      }

      this.logger.log(`Fetched ${items.length} FazerCards game keys`);
      return items;
    } catch (err) {
      this.logger.error(
        'Failed to fetch FazerCards game keys',
        (err as Error)?.stack,
      );
      throw err;
    }
  }

  /**
   * Fetch FazerCards top-up catalog.
   */
  async getFzrTopups(): Promise<FazercardsCatalogItem[]> {
    try {
      const fz = this.fzrService.getClient();
      const [categories, offers] = await Promise.all([
        fz.topups.categories(),
        fz.topups.offers(),
      ]);

      const items: FazercardsCatalogItem[] = [];
      const offerList = Array.isArray(offers) ? offers : offers?.offers ?? [];

      for (const offer of offerList) {
        items.push({
          type: 'topup',
          id: offer.id ?? offer.offer_id,
          name: offer.name,
          categoryId: offer.category_id,
          gameId: offer.game_id,
          value: offer.value,
          currency: offer.currency,
          raw: offer,
        });
      }

      this.logger.log(`Fetched ${items.length} FazerCards topups`);
      return items;
    } catch (err) {
      this.logger.error(
        'Failed to fetch FazerCards topups',
        (err as Error)?.stack,
      );
      throw err;
    }
  }
}
