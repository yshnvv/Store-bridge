export interface FazercardsProductConfig {
  /** 'giftcard' | 'gamekey' | 'topup' | 'steam' | 'telegram' */
  type: 'giftcard' | 'gamekey' | 'topup' | 'steam' | 'telegram';

  /** FazerCards category id (for giftcards/topups) */
  categoryId?: string;

  /** FazerCards card id (for giftcards) */
  cardId?: string;

  /** FazerCards game id (for gamekeys/topups/steam) */
  gameId?: string;

  /** FazerCards key id (for gamekeys) */
  keyId?: string;

  /** Quantity to purchase per Ozon order */
  quantity?: number;

  /** Human-readable name for logs */
  label?: string;
}
