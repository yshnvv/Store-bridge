import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { BodyParserMiddleware } from './common/middleware/body-parser.middleware';
import { AppModule } from './app.module';
import { FzrService } from './fazercards/fazercards.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // we parse per-route via BodyParserMiddleware
  });

  // Global per-route body parsing (raw for FazerCards, JSON elsewhere)
  app.use(new BodyParserMiddleware().use.bind(new BodyParserMiddleware()));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      disableErrorMessages: false,
    }),
  );

  app.enableCors({
    origin: true,
    methods: ['POST', 'OPTIONS', 'GET', 'DELETE'],
    allowedHeaders: [
      'content-type',
      'api-key',
      'authorization',
      'x-ozon-signature',
      'x-webhook-signature',
      'x-webhook-event',
      'x-webhook-event-id',
      'x-webhook-delivery-attempt',
      'x-api-key',
      'idempotency-key',
    ],
  });

  // Optionally auto-register + test the FazerCards webhook on startup
  const fzrService = app.get(FzrService);
  const publicBaseUrl = process.env.PUBLIC_BASE_URL;
  if (publicBaseUrl) {
    const webhookUrl = `${publicBaseUrl.replace(/\/$/, '')}/webhooks/fazercards`;
    try {
      await fzrService.registerWebhook(webhookUrl);
      await fzrService.testWebhook();
    } catch (err) {
      console.warn(
        'FazerCards webhook auto-register/test failed (may already be set):',
        err,
      );
    }
  }

  await app.listen(process.env.PORT ?? 3000);
  console.log(
    `Combined webhook backend listening on port ${process.env.PORT ?? 3000}`,
  );
  console.log('  POST /webhooks/ozon        -> Ozon push notifications');
  console.log('  POST /webhooks/fazercards  -> FazerCards digital-product webhooks');
}

bootstrap();
