import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Thin client for the Ozon Seller API using native fetch.
 *
 * Base URL: https://api-seller.ozon.ru
 * Auth headers: Client-Id, Api-Key
 *
 * Methods used by the fulfillment flow:
 *   - getPosting      → POST /v3/posting/fbs/get   (fetch order + offer_id)
 *   - shipPosting     → POST /v3/posting/fbs/ship  (mark shipped, pass key as tracking)
 *   - sendMessage     → POST /v1/chat/send/message (send the key to the buyer)
 *   - startChat       → POST /v1/chat/start        (create chat with buyer)
 *
 * NOTE: Exact request/response field names vary by Ozon API version. Verify
 * against https://docs.ozon.com/api/seller/ before production use.
 */
@Injectable()
export class OzonApiService {
  private readonly logger = new Logger(OzonApiService.name);
  private readonly baseUrl = 'https://api-seller.ozon.ru';

  constructor(private readonly configService: ConfigService) {}

  private get clientId(): string {
    return this.configService.get<string>('app.ozonClientId') ?? '';
  }

  private get apiKey(): string {
    return this.configService.get<string>('app.ozonApiKey') ?? '';
  }

  private headers() {
    return {
      'Client-Id': this.clientId,
      'Api-Key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  private async request(path: string, body?: unknown): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method: 'POST',
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    };
    const resp = await fetch(url, init);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Ozon API ${path} failed: ${resp.status} ${text}`);
    }
    return resp.json();
  }

  async getPosting(postingNumber: string): Promise<any> {
    return this.request('/v3/posting/fbs/get', {
      posting_numbers: [postingNumber],
    });
  }

  async shipPosting(postingNumber: string, trackingNumber: string): Promise<any> {
    return this.request('/v3/posting/fbs/ship', {
      posting_number: postingNumber,
      tracking_number: trackingNumber,
    });
  }

  async deliverPosting(postingNumber: string): Promise<any> {
    return this.request('/v3/posting/fbs/deliver', {
      posting_number: postingNumber,
    });
  }

  async listProducts(): Promise<any> {
    return this.request('/v4/product/info', {
      filter: { visibility: 'ALL' },
      last_id: '',
      limit: 1000,
    });
  }

  async startChat(orderId: string): Promise<{ chat_id?: string }> {
    return this.request('/v1/chat/start', { order_id: orderId });
  }

  async sendMessage(chatId: string, text: string): Promise<any> {
    return this.request('/v1/chat/send/message', {
      chat_id: chatId,
      text,
    });
  }
}
