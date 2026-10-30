import { DigitalProductConfig } from '../../config/product-mapping';
import { SupplierType } from '../../suppliers/supplier.interface';

export type MatchStrategy = 'name' | 'exact' | 'none';

export type CatalogSource = 'giftcards' | 'gamekeys' | 'topups';

export interface SyncOptions {
  /** Matching strategy: 'name' (fuzzy keyword match), 'exact' (exact name match), 'none' (no auto-match) */
  matchStrategy?: MatchStrategy;
  /** Maximum number of Ozon products to process */
  limit?: number;
  /** If true, don't save to DB, just return what would be synced */
  dryRun?: boolean;
  /** Supplier type to sync from. Defaults to 'fazercards'. */
  supplier?: SupplierType;
  /** When syncing from supplier order history (the default), stop after this many orders. */
  maxOrders?: number;
}

/** Configuration stored per mapping, sync-ready. */
export interface DigitalProductConfigForSync extends DigitalProductConfig {}

export interface SyncResult {
  totalOzonProducts: number;
  totalSupplierProducts: number;
  synced: number;
  matched: number;
  unmatched: number;
  skipped: number;
  mappings: SyncMappingResult[];
  errors: SyncError[];
}

export interface SyncMappingResult {
  ozonOfferId: string;
  ozonProductName: string;
  fazercardsConfig?: DigitalProductConfigForSync;
  matchStrategy: MatchStrategy;
  matchScore?: number;
  matchedFzrProductName?: string;
  saved: boolean;
}

export interface SyncError {
  ozonOfferId?: string;
  ozonProductName?: string;
  message: string;
}

export interface ProductWithScore {
  product: DigitalProductConfigForSync;
  score: number;
  matchedKeywords: string[];
}
