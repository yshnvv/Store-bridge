import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as express from 'express';

/**
 * Dispatches body parsing by route path:
 *  - /webhooks/fazercards -> RAW body (Buffer). FazerCards HMAC is computed over raw bytes.
 *  - everything else      -> JSON body (express.json())
 *
 * NestJS global bodyParser is disabled so we control parsing per-route.
 */
@Injectable()
export class BodyParserMiddleware implements NestMiddleware {
  private readonly logger = new Logger(BodyParserMiddleware.name);
  private readonly jsonParser = express.json();
  private readonly rawParser = express.raw({ type: 'application/json' });

  use(req: Request, res: Response, next: NextFunction): void {
    const isFazercards = req.originalUrl.startsWith('/webhooks/fazercards');

    if (isFazercards) {
      this.rawParser(req, res, (err?: Error | null) => {
        if (err) {
          this.logger.error('Raw body parsing failed', err.stack);
          res.status(400).json({ error: 'Invalid request body' });
          return;
        }
        next();
      });
    } else {
      this.jsonParser(req, res, (err?: Error | null) => {
        if (err) {
          this.logger.error('JSON body parsing failed', err.stack);
          res.status(400).json({ error: 'Invalid request body' });
          return;
        }
        next();
      });
    }
  }
}
