import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Simple secret-token guard for Ozon webhooks.
 *
 * Header locations Ozon might use: Api-Key, Authorization: Bearer, X-Ozon-Signature.
 * Set ENFORCE_OZON_AUTH=false while developing behind ngrok.
 */
@Injectable()
export class OzonAuthGuard {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const enforce = this.configService.get<boolean>('app.enforceOzonAuth');
    if (!enforce) {
      return true;
    }

    const secret = this.configService.get<string>('app.ozonWebhookSecret');
    if (!secret) {
      throw new UnauthorizedException('Ozon webhook secret is not configured');
    }

    const request = context.switchToHttp().getRequest();
    const provided =
      request.headers['api-key'] ||
      (request.headers['authorization'] as string)?.replace('Bearer ', '') ||
      request.headers['x-ozon-signature'];

    if (!provided || provided !== secret) {
      throw new UnauthorizedException('Invalid Ozon webhook secret');
    }

    return true;
  }
}
