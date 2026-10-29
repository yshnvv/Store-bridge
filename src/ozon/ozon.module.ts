import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OzonWebhookController } from './ozon.controller';
import { OzonService } from './ozon.service';
import { OzonAuthGuard } from './guards/ozon-auth.guard';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';

@Module({
  imports: [ConfigModule, FulfillmentModule],
  controllers: [OzonWebhookController],
  providers: [OzonService, OzonAuthGuard],
  exports: [OzonService],
})
export class OzonModule {}
