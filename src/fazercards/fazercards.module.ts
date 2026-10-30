import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FzrWebhookController } from './fazercards.controller';
import { FzrSignatureGuard } from './guards/fzr-signature.guard';
import { FzrWebhookHandler } from './fazercards.handler';
import { FzrService } from './fazercards.service';
import { FazerCardsBuyService } from './fazercards-buy.service';

@Module({
  imports: [ConfigModule],
  controllers: [FzrWebhookController],
  providers: [FzrSignatureGuard, FzrWebhookHandler, FzrService, FazerCardsBuyService],
  exports: [FzrService, FazerCardsBuyService],
})
export class FzrModule {}
