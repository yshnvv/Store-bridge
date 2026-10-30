import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FulfillmentService } from './fulfillment.service';
import { FulfillmentController } from './fulfillment.controller';
import { FulfillmentStore, fulfillmentStore } from './fulfillment.store';
import { OzonApiService } from '../ozon/ozon-api.service';
import { MappingModule } from '../catalog/mapping/mapping.module';
import { SuppliersModule } from '../suppliers/suppliers.module';

@Module({
  imports: [ConfigModule, MappingModule, SuppliersModule],
  controllers: [FulfillmentController],
  providers: [
    { provide: FulfillmentStore, useValue: fulfillmentStore },
    FulfillmentService,
    OzonApiService,
  ],
  exports: [FulfillmentService],
})
export class FulfillmentModule {}
