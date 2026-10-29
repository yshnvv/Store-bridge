import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  Logger,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { OzonWebhookDto } from './dto/webhook.dto';
import { OzonService } from './ozon.service';
import { OzonAuthGuard } from './guards/ozon-auth.guard';
import { LoggingInterceptor } from '../common/interceptors/logging.interceptor';
import { OzonNotificationPayload } from './dto/webhook.dto';

@Controller()
export class OzonWebhookController {
  private readonly logger = new Logger(OzonWebhookController.name);

  constructor(private readonly ozonService: OzonService) {}

  /**
   * Ozon push notification endpoint.
   *
   * Register this URL in Ozon Seller cabinet / API notifications:
   *   https://<your-public-domain>/webhooks/ozon
   *
   * Responds 200 OK immediately so Ozon does not retry.
   */
  @UseGuards(OzonAuthGuard)
  @UseInterceptors(LoggingInterceptor)
  @Post('webhooks/ozon')
  @HttpCode(HttpStatus.OK)
  handleOzonWebhook(
    @Body() dto: OzonWebhookDto,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    this.logger.log(`Incoming Ozon webhook from ${req.ip}`);

    const payload: OzonNotificationPayload = {
      type: dto.type,
      posting_number: dto.posting_number,
      status: dto.status,
      data: dto.data,
      raw: dto.raw,
      timestamp: dto.timestamp ?? new Date().toISOString(),
    };

    // Process asynchronously (fire-and-forget) but reply to Ozon immediately.
    try {
      this.ozonService.handleNotification(payload);
    } catch (error) {
      this.logger.error(
        'Failed to handle Ozon notification',
        (error as Error)?.stack ?? String(error),
      );
    }

    res.status(HttpStatus.OK).json({ status: 'ok' });
  }
}
