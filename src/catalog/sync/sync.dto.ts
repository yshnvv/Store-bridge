import { FazercardsCatalogItem } from '../catalog.service';
import { FazercardsProductConfig } from '../../config/product-mapping';

export type MatchStrategy = 'name' | 'exact' | 'none';

export type CatalogSource = 'giftcards' | 'gamekeys' | 'topups';

export interface SyncOptions {
  /** Matching strategy: 'name' (fuzzy keyword match), 'exact' (exact name match), 'none' (no auto-match) */
  matchStrategy?: MatchStrategy;
  /** Maximum number of Ozon products to process */
  limit?: number;
  /** If true, don't save to DB, just return what would be synced */
  dryRun?: boolean;
  /**
   * FazerCards catalog families to fetch. Defaults to all three.
   * Fetching fewer families makes the sync faster.
   */
  sources?: CatalogSource[];
  /**
   * Fetch the entire FazerCards catalog instead of only the categories/games
   * whose name appears in an Ozon product name. Slower: hundreds of extra
   * requests, and mostly useless products for matching.
   */
  fullCatalog?: boolean;
}

export interface SyncResult {
  totalOzonProducts: number;
  totalFzrProducts: number;
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
  fazercardsConfig?: FazercardsProductConfigForSync;
  matchStrategy: MatchStrategy;
  matchScore?: number;
  matchedFzrProductName?: string;
  saved: boolean;
}

/**
 * The mapping config stored for a sync result. Same shape as the persisted
 * config, so the sync result and the DB record never drift apart.
 */
export interface FazercardsProductConfigForSync extends FazercardsProductConfig {}

export interface SyncError {
  ozonOfferId?: string;
  ozonProductName?: string;
  message: string;
}

export interface FzrProductWithScore {
  product: FazercardsCatalogItem;
  score: number;
  matchedKeywords: string[];
}
