import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Thin wrapper around the official FazerCards SDK (fazercards).
 *
 * Register/test your webhook URL:
 *   await fz.webhooks.set({ url: 'https://<domain>/webhooks/fazercards' });
 *   await fz.webhooks.test();
 */
@Injectable()
export class FzrService {
  private readonly logger = new Logger(FzrService.name);
  private fz: any;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('app.fzApiKey');
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fazercards = require('fazercards');
      this.fz = new fazercards.FazerCardsClient({ apiKey });
      this.logger.log('FazerCards SDK initialized');
    } catch (err) {
      this.logger.warn(
        'FazerCards SDK not available; webhook registration skipped',
      );
    }
  }

  async registerWebhook(url: string): Promise<void> {
    if (!this.fz) return;
    await this.fz.webhooks.set({ url });
    this.logger.log(`FazerCards webhook registered: ${url}`);
  }

  async testWebhook(): Promise<void> {
    if (!this.fz) return;
    const res = await this.fz.webhooks.test();
    this.logger.log('FazerCards webhook test sent', res);
  }

  /**
   * Returns the raw FazerCards SDK client for catalog operations.
   */
  getClient(): any {
    if (!this.fz) {
      const apiKey = this.configService.get<string>('app.fzApiKey');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fazercards = require('fazercards');
      this.fz = new fazercards.FazerCardsClient({ apiKey });
    }
    return this.fz;
  }
}
