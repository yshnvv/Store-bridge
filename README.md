# Combined Webhook Backend (NestJS) — Ozon + FazerCards (fzr.cards)

One NestJS backend that receives webhooks from **two platforms** and implements an **auto-fulfillment flow** for digital products:

| Endpoint | Platform | Purpose |
|---|---|---|
| `POST /webhooks/ozon` | Ozon Seller | Posting/order lifecycle events |
| `POST /webhooks/fazercards` | FazerCards | Digital product webhooks (signature-verified) |
| `GET /admin/catalog/ozon` | Admin | List Ozon products (dynamic catalog) |
| `GET /admin/catalog/fazercards/giftcards` | Admin | List FazerCards gift cards |
| `GET /admin/catalog/fazercards/gamekeys` | Admin | List FazerCards game keys |
| `GET /admin/catalog/fazercards/topups` | Admin | List FazerCards topups |
| `GET /admin/catalog/mapping` | Admin | View Ozon→FazerCards mappings |
| `POST /admin/catalog/mapping` | Admin | Create/update a mapping |
| `DELETE /admin/catalog/mapping/:ozonOfferId` | Admin | Delete a mapping |
| `POST /admin/catalog/sync` | Admin | Pull catalogs from Ozon + FazerCards, auto-match, store in MongoDB |

## Auto-fulfillment flow (Ozon → FazerCards → buyer)

When a customer buys a digital product on Ozon:

1. **Ozon webhook fires** → `POST /webhooks/ozon` (`NEW_POSTING` or `POSTING_STATUS_CHANGED`)
2. **Backend looks up** the Ozon posting → extracts the `offer_id` (product SKU)
3. **Product mapping** (MongoDB) maps the Ozon `offer_id` → FazerCards product (category_id/card_id or game_id/key_id)
4. **Backend buys the key** from FazerCards via the official SDK (`giftcards.order` or `gamekeys.order`), using the Ozon posting number as the **idempotency key** (so retries never double-buy)
5. **FazerCards delivers** the digital code/key → backend waits until terminal status (`orders.wait`)
6. **Backend delivers the key** to the Ozon buyer:
   - Ships the Ozon posting with the key as the `tracking_number` (buyer sees it on their order page), **or**
   - Sends the key via Ozon chat message (`/v1/chat/start` + `/v1/chat/send/message`)
7. **Ozon posting marked shipped/delivered** → order complete

Every step is recorded in MongoDB (`product_mappings` collection for mappings; in-memory store for fulfillment records).

## Dynamic catalog + MongoDB mapping (no hardcoding)

Instead of hardcoding `PRODUCT_MAPPING`, you now:

1. **Fetch live catalogs** from both platforms via admin endpoints
2. **Auto-match products by name** via `POST /admin/catalog/sync`
3. **Mappings stored in MongoDB** (`product_mappings` collection)

### Sync endpoint: `POST /admin/catalog/sync`

Pulls articles/products from Ozon and FazerCards, auto-matches them by name, and stores the mappings in MongoDB.

**Request body:**
```json
{
  "matchStrategy": "name",   // "name" (keyword overlap) | "exact" (exact name match) | "none" (no match)
  "limit": 100,              // max Ozon products to process (default: 100)
  "dryRun": false            // preview without saving to DB (default: false)
}
```

**Matching strategies:**
- `name`: Extracts keywords from Ozon product names, scores FazerCards products by keyword overlap, picks the best match
- `exact`: Only matches if Ozon name == FazerCards name (case-insensitive)
- `none`: Returns all Ozon products as unmatched

**Example response:**
```json
{
  "totalOzonProducts": 150,
  "totalFzrProducts": 85,
  "synced": 23,
  "matched": 23,
  "unmatched": 127,
  "skipped": 0,
  "mappings": [
    {
      "ozonOfferId": "STEAM_WALLET_100",
      "ozonProductName": "Steam Wallet 100 RUB",
      "fazercardsConfig": {
        "type": "topup",
        "gameId": "steam_wallet",
        "quantity": 1,
        "label": "Steam Wallet 100"
      },
      "matchStrategy": "name",
      "matchScore": 12,
      "matchedFzrProductName": "Steam Wallet 100",
      "saved": true
    }
  ],
  "errors": []
}
```

### How to use

1. Start the server: `npm run start:dev`
2. Dry run first (preview matches without saving):
   ```bash
   curl -X POST http://localhost:3000/admin/catalog/sync \
     -H "Content-Type: application/json" \
     -d '{"matchStrategy":"name","limit":50,"dryRun":true}'
   ```
3. Run for real (saves to MongoDB Atlas):
   ```bash
   curl -X POST http://localhost:3000/admin/catalog/sync \
     -H "Content-Type: application/json" \
     -d '{"matchStrategy":"name","limit":100,"dryRun":false}'
   ```
4. View saved mappings:
   ```bash
   curl http://localhost:3000/admin/catalog/mapping
   ```

## MongoDB setup

You need a running MongoDB instance. Options:

- **Local:** `docker run -d -p 27017:27017 mongo`
- **MongoDB Atlas:** free cloud tier at https://www.mongodb.com/cloud/atlas

Set `MONGO_URI` in `.env`:
```
MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/<dbname>?retryWrites=true&w=majority
MONGO_DATABASE=fazercards_webhook
```

On startup, NestJS connects to MongoDB and ensures the `product_mappings` collection exists.

## Critical: body parsing differs per platform

- **FazerCards** signs the **raw request body** (HMAC-SHA256), so `/webhooks/fazercards` uses `express.raw()` (Buffer).
- **Ozon** uses normal JSON (`express.json()`).

The `BodyParserMiddleware` dispatches by route path automatically.

## 1. Install

```bash
cd D:\Projects\jenya\combined-webhook-backend
npm install
```

## 2. Configure

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Purpose |
|---|---|
| `PORT` | Port (default `3000`) |
| `PUBLIC_BASE_URL` | Public URL of your backend (used to auto-register FazerCards webhook) |
| `MONGO_URI` | MongoDB connection string |
| `OZON_CLIENT_ID` | Ozon Seller API Client-Id |
| `OZON_API_KEY` | Ozon Seller API Api-Key |
| `OZON_WEBHOOK_SECRET` | Secret Ozon sends with each notification |
| `ENFORCE_OZON_AUTH` | `true` in production, `false` while testing behind ngrok |
| `FZ_API_KEY` | FazerCards API key (for `webhooks.set` / `test` / buying keys) |
| `FZ_WEBHOOK_SECRET` | FazerCards webhook signing secret — match your reseller hub |
| `ENFORCE_FZR_AUTH` | `true` in production, `false` while testing behind ngrok |

## 3. Map your products

Edit `src/config/product-mapping.ts`. Add one entry per Ozon product:

```ts
export const PRODUCT_MAPPING: Record<string, FazercardsProductConfig> = {
  'YOUR_OZON_OFFER_ID': {
    type: 'giftcard',   // or 'gamekey' | 'topup' | 'steam' | 'telegram'
    categoryId: 'fz-category-id',
    cardId: 'fz-card-id',
    quantity: 1,
    label: '$10 Gift Card',
  },
};
```

Get `category_id` / `card_id` / `game_id` / `key_id` from the FazerCards reseller hub or catalog API.

## 4. Run locally

```bash
npm run start:dev
```

Endpoints:
- `http://localhost:3000/webhooks/ozon`
- `http://localhost:3000/webhooks/fazercards`
- `GET http://localhost:3000/fulfillment?posting_number=...` (debug: view fulfillment record)

## 5. Make it publicly reachable (ngrok)

Both platforms must POST to your backend over the public internet:

```bash
ngrok http 3000
```

Register these callback URLs:
- Ozon: `https://<ngrok>/webhooks/ozon` (in Ozon Seller cabinet → Push notifications)
- FazerCards: `https://<ngrok>/webhooks/fazercards` (in FazerCards reseller hub, or auto-registered on startup if `PUBLIC_BASE_URL` is set)

## 6. Test the webhooks

**Ozon** (set `ENFORCE_OZON_AUTH=false`):

```bash
curl -X POST http://localhost:3000/webhooks/ozon \
  -H "Content-Type: application/json" \
  -H "Api-Key: ozon-secret-here" \
  -d '{
    "type": "NEW_POSTING",
    "posting_number": "1234567-8901",
    "status": "awaiting_packaging",
    "data": { "offer_id": "YOUR_OZON_OFFER_ID" }
  }'
```

**FazerCards** — signature must be HMAC-SHA256 of the **raw body**. Generate it with the SDK:

```ts
import { computeSignature } from 'fazercards';
const sig = computeSignature(rawBody, 'fazercards-secret-here'); // 'sha256=...'
```

POST with headers:
- `X-Webhook-Signature: <sig>`
- `X-Webhook-Event: order.status_changed`
- `X-Webhook-Event-Id: <uuid>`
- `X-Webhook-Delivery-Attempt: 1`

## Project structure

```
src/
  main.ts                 # Bootstrap + per-route body parsing + optional webhook auto-register
  app.module.ts           # OzonModule + FzrModule + FulfillmentModule
  config/configuration.ts # All env vars
  config/product-mapping.ts   # Ozon offer_id → FazerCards product mapping
  common/
    middleware/body-parser.middleware.ts   # raw for fazercards, json elsewhere
    decorators/public.decorator.ts
    interceptors/logging.interceptor.ts
    interfaces/request-with-fzr-event.interface.ts
  ozon/
    ozon.module.ts
    ozon.controller.ts       # POST /webhooks/ozon → triggers fulfillment
    ozon.service.ts          # Ozon event handling
    ozon-api.service.ts      # Ozon Seller API client (ship, deliver, chat)
    dto/webhook.dto.ts
    guards/ozon-auth.guard.ts
  fazercards/
    fazercards.module.ts
    fazercards.controller.ts # POST /webhooks/fazercards
    fazercards.handler.ts    # order.created / order.status_changed
    fazercards.service.ts    # FazerCards SDK wrapper (register/test webhook)
    fazercards-buy.service.ts# Buy digital key from FazerCards (orders.wait)
    dto/webhook.dto.ts
    guards/fzr-signature.guard.ts  # HMAC-SHA256 verification
  fulfillment/
    fulfillment.module.ts
    fulfillment.service.ts   # Orchestration: Ozon → buy key → deliver → ship
    fulfillment.controller.ts# GET /fulfillment (debug)
    fulfillment.store.ts     # In-memory record store (swap for DB in production)
    entities/fulfillment-record.entity.ts
```

## Production notes

- Replace `FulfillmentStore` (in-memory) with Redis / PostgreSQL / MongoDB for persistence across restarts.
- Set `ENFORCE_OZON_AUTH=true` and `ENFORCE_FZR_AUTH=true`; configure both secrets.
- Terminate HTTPS at your reverse proxy / load balancer (both platforms require HTTPS callbacks).
- Add structured logging and alerts for failed fulfillment.
- For FazerCards digital goods, fulfillment is triggered on `order.status_changed` → `fulfilled`/`delivered`.
- Verify exact Ozon API field names (`tracking_number`, `chat_id`, etc.) against https://docs.ozon.com/api/seller/ before production use.
