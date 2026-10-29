import {
  Controller,
  Post,
  UseGuards,
  Req,
  Res,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { FzrSignatureGuard } from './guards/fzr-signature.guard';
import { FzrWebhookHandler } from './fazercards.handler';
import { RequestWithFzrEvent } from '../common/interfaces/request-with-fzr-event.interface';

/**
 * FazerCards webhook endpoint.
 *
 * Register this URL in your FazerCards reseller hub:
 *   https://<your-public-domain>/webhooks/fazercards
 *
 * The body-parser middleware supplies the RAW body for HMAC verification.
 */
@Controller()
export class FzrWebhookController {
  private readonly logger = new Logger(FzrWebhookController.name);

  constructor(private readonly handler: FzrWebhookHandler) {}

  @UseGuards(FzrSignatureGuard)
  @Post('webhooks/fazercards')
  @HttpCode(HttpStatus.OK)
  async handleFazercardsWebhook(
    @Req() req: RequestWithFzrEvent,
    @Res() res: Response,
  ): Promise<void> {
    const event = req.fzrEvent;
    if (!event) {
      this.logger.warn('Webhook called without parsed event');
      res.status(HttpStatus.BAD_REQUEST).json({ status: 'error' });
      return;
    }

    try {
      this.handler.handle(event);
    } catch (error) {
      this.logger.error(
        'Failed to handle FazerCards webhook',
        (error as Error)?.stack ?? String(error),
      );
    }

    res.status(HttpStatus.OK).json({
      status: 'ok',
      event_id: event.event_id,
    });
  }
}
