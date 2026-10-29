import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FulfillmentService } from './fulfillment.service';
import { FulfillmentController } from './fulfillment.controller';
import { FulfillmentStore, fulfillmentStore } from './fulfillment.store';
import { OzonApiService } from '../ozon/ozon-api.service';
import { FazerCardsBuyService } from '../fazercards/fazercards-buy.service';
import { MappingModule } from '../catalog/mapping/mapping.module';

@Module({
  imports: [ConfigModule, MappingModule],
  controllers: [FulfillmentController],
  providers: [
    { provide: FulfillmentStore, useValue: fulfillmentStore },
    FulfillmentService,
    OzonApiService,
    FazerCardsBuyService,
  ],
  exports: [FulfillmentService],
})
export class FulfillmentModule {}
