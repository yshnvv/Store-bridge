import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? '',
  mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/fazercards_webhook',

  // Ozon
  ozonClientId: process.env.OZON_CLIENT_ID ?? '',
  ozonApiKey: process.env.OZON_API_KEY ?? '',
  ozonWebhookSecret: process.env.OZON_WEBHOOK_SECRET ?? '',
  enforceOzonAuth: process.env.ENFORCE_OZON_AUTH === 'true',

  // FazerCards
  fzApiKey: process.env.FZ_API_KEY ?? '',
  fzWebhookSecret: process.env.FZ_WEBHOOK_SECRET ?? '',
  enforceFzrAuth: process.env.ENFORCE_FZR_AUTH === 'true',
}));
