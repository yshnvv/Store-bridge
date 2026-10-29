import {
  FulfillmentStatus,
  OzonFulfillmentRecord,
} from './entities/fulfillment-record.entity';

/**
 * In-memory store for fulfillment records.
 *
 * WARNING: Data is lost on restart. Replace with Redis / PostgreSQL / MongoDB
 * in production. The store is keyed by Ozon posting number.
 */
export class FulfillmentStore {
  private readonly records = new Map<string, OzonFulfillmentRecord>();

  get(postingNumber: string): OzonFulfillmentRecord | undefined {
    return this.records.get(postingNumber);
  }

  set(record: OzonFulfillmentRecord): void {
    this.records.set(record.ozonPostingNumber, record);
  }

  has(postingNumber: string): boolean {
    return this.records.has(postingNumber);
  }

  list(): OzonFulfillmentRecord[] {
    return Array.from(this.records.values());
  }
}

export const fulfillmentStore = new FulfillmentStore();
