import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  parseWebhookEvent,
  WebhookSignatureError,
} from 'fazercards';
import { RequestWithFzrEvent } from '../../common/interfaces/request-with-fzr-event.interface';
import { Request } from 'express';
import { FzrWebhookEventPayload } from '../dto/webhook.dto';

/**
 * Verifies the FazerCards webhook HMAC signature and parses the event.
 *
 * FazerCards signs the RAW request body (not parsed JSON). The body-parser
 * middleware leaves req.body as a Buffer for the /webhooks/fazercards route.
 *
 * When ENFORCE_FZR_AUTH=false (dev/ngrok), signature verification is skipped
 * but the body is still parsed into req.fzrEvent so the controller works.
 *
 * Headers:
 *   x-webhook-signature       -> sha256= HMAC-SHA256 of raw body
 *   x-webhook-event           -> order.created / order.status_changed / ...
 *   x-webhook-event-id        -> UUID v4, stable across retries (dedupe key)
 *   x-webhook-delivery-attempt -> 1-based retry attempt
 */
@Injectable()
export class FzrSignatureGuard {
  private readonly logger = new Logger(FzrSignatureGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: any): boolean {
    const enforce = this.configService.get<boolean>('app.enforceFzrAuth');
    const secret = this.configService.get<string>('app.fzWebhookSecret');

    const req = context.switchToHttp().getRequest() as RequestWithFzrEvent;
    const signature = (req.headers['x-webhook-signature'] as string) ?? '';
    const rawBody = req.body;
    const buffer =
      rawBody instanceof Buffer
        ? rawBody
        : Buffer.from(JSON.stringify(rawBody ?? ''));

    let event: FzrWebhookEventPayload;

    if (enforce) {
      if (!secret) {
        throw new UnauthorizedException('FazerCards webhook secret is not configured');
      }
      if (!signature) {
        this.logger.warn('Missing x-webhook-signature header');
        throw new UnauthorizedException('Missing webhook signature');
      }
      try {
        event = parseWebhookEvent(buffer, signature, secret);
      } catch (err) {
        if (err instanceof WebhookSignatureError) {
          this.logger.warn('Invalid FazerCards webhook signature');
          throw new UnauthorizedException('Invalid webhook signature');
        }
        this.logger.error(
          'Failed to parse webhook event',
          (err as Error)?.stack ?? String(err),
        );
        throw new UnauthorizedException('Invalid webhook payload');
      }
    } else {
      // Dev mode: parse JSON body directly without signature verification.
      try {
        const text = buffer.toString('utf8');
        const parsed = JSON.parse(text) as FzrWebhookEventPayload;
        event = parsed;
      } catch (err) {
        this.logger.warn('Invalid JSON body in FazerCards webhook');
        throw new BadRequestException('Invalid JSON body');
      }
    }

    req.fzrEvent = event;
    this.logger.log(
      `FazerCards webhook: ${event.event} (id=${event.event_id}) enforce=${enforce}`,
    );
    return true;
  }
}
