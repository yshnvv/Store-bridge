/**
 * Supplier abstraction for digital product providers (FazerCards, etc.).
 *
 * Each supplier implements this interface. The factory (SupplierFactory)
 * routes calls to the right supplier based on `config.supplier`.
 */

export enum SupplierType {
  FAZERCARDS = 'fazercards',
  // future: STEAM = 'steam', TELEGRAM = 'telegram', etc.
}

/** Configuration stored per Ozon→supplier mapping. */
export interface DigitalProductConfig {
  /** Which supplier fulfils this product. */
  supplier: SupplierType;

  /** Product flavour within the supplier (giftcard | gamekey | topup | …). */
  type: string;

  /** Quantity to purchase per Ozon order. */
  quantity?: number;

  /** Human-readable name for logs / UI. */
  label?: string;

  /** Supplier-specific fields needed to buy (categoryId, cardId, gameId, keyId, …). */
  config: Record<string, unknown>;

  /* ── Catalog snapshot, refreshed on every sync ── */

  /** Supplier catalog item id. */
  catalogId?: string;

  /** Product name as returned by the supplier catalog. */
  name?: string;

  /** Price per unit in USD, exactly as reported by the supplier. */
  priceUsd?: string;

  /** Units in stock at the time of the last sync. */
  stock?: number;
}

/** A purchasable item returned by a supplier catalog. */
export interface DigitalCatalogItem {
  supplier: SupplierType;
  /** Supplier-specific id used to place an order. */
  id: string;
  name?: string;
  type?: string;
  priceUsd?: string;
  stock?: number;
  /** Fields needed to buy this item (categoryId, cardId, gameId, keyId, …). */
  config: Record<string, unknown>;
}

/** Result of buying a key / code from a supplier. */
export interface BuyResult {
  orderId: string;
  status: string;
  code?: string;
  boughtAt?: string;
  raw?: unknown;
}

/** Every supplier must implement this interface. */
export interface DigitalProductSupplier {
  readonly supplier: SupplierType;
  fetchCatalog(options?: { maxOrders?: number }): Promise<DigitalCatalogItem[]>;
  buyKey(
    config: DigitalProductConfig,
    idempotencyKey: string,
  ): Promise<BuyResult>;
}
