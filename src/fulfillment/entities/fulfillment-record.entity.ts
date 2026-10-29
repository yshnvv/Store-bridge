export enum FulfillmentStatus {
  PENDING = 'pending',
  BUYING_KEY = 'buying_key',
  KEY_BOUGHT = 'key_bought',
  DELIVERED_TO_BUYER = 'delivered_to_buyer',
  OZON_SHIPPED = 'ozon_shipped',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface FazercardsOrderRecord {
  orderId?: string;
  status?: string;
  code?: string; // the digital key / code / link delivered by FazerCards
  product?: any;
  boughtAt?: string;
}

export interface OzonFulfillmentRecord {
  ozonPostingNumber: string;
  ozonOfferId?: string;
  ozonStatus?: string;
  customerEmail?: string;
  fulfillmentStatus: FulfillmentStatus;
  fazercardsOrder?: FazercardsOrderRecord;
  keyDeliveredAt?: string;
  ozonShippedAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
