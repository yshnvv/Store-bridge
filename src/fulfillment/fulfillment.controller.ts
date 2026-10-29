import { Controller, Get, Query, Logger } from '@nestjs/common';
import { FulfillmentService } from './fulfillment.service';

/**
 * Debug / admin endpoints for fulfillment.
 *
 *   GET /fulfillment?posting_number=1234567-8901   → get single record
 *   GET /fulfillment                                → list all records
 *
 * Protect these with auth in production.
 */
@Controller('fulfillment')
export class FulfillmentController {
  private readonly logger = new Logger(FulfillmentController.name);

  constructor(private readonly fulfillment: FulfillmentService) {}

  @Get()
  getRecord(@Query('posting_number') postingNumber?: string) {
    if (postingNumber) {
      return this.fulfillment.getRecord(postingNumber);
    }
    return this.fulfillment.listRecords();
  }
}
