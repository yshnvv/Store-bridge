export enum FulfillmentStatus {
  PENDING = 'pending',
  BUYING_KEY = 'buying_key',
  KEY_BOUGHT = 'key_bought',
  DELIVERED_TO_BUYER = 'delivered_to_buyer',
  OZON_SHIPPED = 'ozon_shipped',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/** Order record returned by any digital product supplier. */
export interface SupplierOrderRecord {
  orderId?: string;
  status?: string;
  code?: string; // the digital key / code / link delivered by the supplier
  product?: any;
  boughtAt?: string;
}

export interface OzonFulfillmentRecord {
  ozonPostingNumber: string;
  ozonOfferId?: string;
  ozonStatus?: string;
  customerEmail?: string;
  fulfillmentStatus: FulfillmentStatus;
  /** Supplier order details (supplier-agnostic). */
  supplierOrder?: SupplierOrderRecord;
  keyDeliveredAt?: string;
  ozonShippedAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FulfillmentStats {
  total: number;
  byStatus: Record<FulfillmentStatus, number>;
  completed: number;
  failed: number;
  successRate: number;
}
