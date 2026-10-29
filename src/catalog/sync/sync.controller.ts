import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CatalogSyncService } from './sync.service';
import { SyncOptions, SyncResult } from './sync.dto';

/**
 * Catalog sync endpoint.
 *
 * POST /admin/catalog/sync
 *
 * Pulls articles/products from Ozon and FazerCards, auto-matches them by name,
 * and stores the mappings in MongoDB.
 *
 * Body:
 *   {
 *     "matchStrategy": "name" | "exact" | "none",  // default "name"
 *     "limit": 100,                                 // max Ozon products to process
 *     "dryRun": false                               // preview without saving
 *   }
 */
@Controller('admin/catalog/sync')
export class CatalogSyncController {
  private readonly logger = new Logger(CatalogSyncController.name);

  constructor(private readonly syncService: CatalogSyncService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async sync(@Body() options: SyncOptions = {}): Promise<SyncResult> {
    this.logger.log(
      `Catalog sync requested: strategy=${options.matchStrategy ?? 'name'}, limit=${options.limit ?? 100}, dryRun=${options.dryRun ?? false}`,
    );
    return this.syncService.sync(options);
  }
}
