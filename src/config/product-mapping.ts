import { SupplierType } from '../suppliers/supplier.interface';

/**
 * Configuration stored per Ozon→supplier mapping.
 *
 * `FazercardsProductConfig` is kept as a deprecated alias for backward
 * compatibility with existing code / DB records.
 */

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

/** @deprecated Use DigitalProductConfig instead. */
export type FazercardsProductConfig = DigitalProductConfig;
