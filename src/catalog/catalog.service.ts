import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OzonApiService } from "../ozon/ozon-api.service";
import { FzrService } from "../fazercards/fazercards.service";

export interface OzonProductSummary {
	offer_id: string;
	product_id?: string;
	name?: string;
	price?: number;
	currency_code?: string;
}

export interface FazercardsCatalogItem {
	type: "giftcard" | "gamekey" | "topup" | "steam" | "telegram";
	/** Unique id: `<categoryId>:<cardId>` for gift cards/top-ups, `<gameId>:<keyId>` for game keys. */
	id: string;
	name?: string;
	categoryId?: string;
	cardId?: string;
	gameId?: string;
	keyId?: string;
	/** Price per unit in USD as reported by FazerCards (decimal string). */
	priceUsd?: string;
	/** Units currently in stock, when FazerCards reports it. */
	stock?: number;
	raw: any;
}

export interface CatalogFetchOptions {
	/**
	 * Only fetch offers for categories/games whose name matches this predicate.
	 * The sync uses it to skip hundreds of catalog requests for games that are
	 * not sold on Ozon. Omit it to walk the whole catalog.
	 */
	nameFilter?: (parentName: string) => boolean;
}

/** FazerCards catalog listings are cursor-paginated; 100 is the documented max. */
const PAGE_LIMIT = 100;
/** FazerCards offers are fetched per category/game, so fan out a little. */
const OFFER_CONCURRENCY = 4;
/**
 * Catalog reads are limited to 300/min per API key. Pace them client-side so we
 * never trip 429s (the SDK would then sleep on `Retry-After`).
 */
const CATALOG_MIN_INTERVAL_MS = 220;

/**
 * Test fixtures appended to the Ozon catalog, so the catalog UI and the
 * name-matching sync can be exercised without real Ozon products.
 * Delete this constant (and its use in `getOzonProducts`) when done testing.
 */
const TEST_OZON_PRODUCTS: OzonProductSummary[] = [
	{
		offer_id: "TEST-ROBLOX",
		product_id: "test-roblox",
		name: "Call of Duty",
		price: 0,
		currency_code: "RUB",
	},
];

/**
 * Fetches live catalogs from Ozon and FazerCards.
 *
 * Used by the admin UI so a human can pick which Ozon offer_id maps to
 * which FazerCards product. The actual mapping is stored in MappingService.
 *
 * Note on the FazerCards API: `giftcards.cards()`, `topups.offers()` and
 * `gamekeys.keys()` all require a parent id (category or game), so the catalog
 * is built by walking the categories/games first and then their offers.
 */
@Injectable()
export class CatalogService {
	private readonly logger = new Logger(CatalogService.name);
	private readonly limiter = new RateLimiter(CATALOG_MIN_INTERVAL_MS);

	constructor(
		private readonly ozonApi: OzonApiService,
		private readonly fzrService: FzrService,
		private readonly configService: ConfigService,
	) {}

	/**
	 * Fetch all Ozon products (offers).
	 * Returns a flattened list of { offer_id, product_id, name, price }.
	 */
	async getOzonProducts(): Promise<OzonProductSummary[]> {
		try {
			const resp = await this.ozonApi.listProducts();
			const items = resp.result?.items ?? resp?.result ?? [];
			const products: OzonProductSummary[] = [];

			// Ozon v4/product/info returns items keyed by product_id/offer_id
			if (Array.isArray(items)) {
				for (const item of items) {
					const it = item as Record<string, unknown>;
					products.push({
						offer_id: String(it.offer_id ?? ""),
						product_id: String(it.product_id ?? ""),
						// Ozon product lists often omit `name`; the offer_id is
						// the human-readable product name ("4500 Robux").
						name: String(it.name ?? it.offer_id ?? ""),
						price: Number(it.price ?? 0),
						currency_code: String(it.currency_code ?? ""),
					});
				}
			} else if (items && typeof items === "object") {
				for (const [productId, item] of Object.entries(items)) {
					const it = item as Record<string, unknown>;
					const offerId = String(it.offer_id ?? productId);
					products.push({
						offer_id: offerId,
						product_id: productId,
						name: String(it.name ?? offerId),
						price: Number(it.price ?? 0),
						currency_code: String(it.currency_code ?? ""),
					});
				}
			}

			// products.push(...TEST_OZON_PRODUCTS);

			this.logger.log(`Fetched ${products.length} Ozon products`);
			return products;
		} catch (err) {
			this.logger.error("Failed to fetch Ozon products", (err as Error)?.stack);
			throw err;
		}
	}

	/**
	 * Fetch FazerCards gift card catalog: every category, then every denomination
	 * (`offers`) inside it.
	 */
	async getFzrGiftcards(
		options: CatalogFetchOptions = {},
	): Promise<FazercardsCatalogItem[]> {
		try {
			const fz = this.fzrService.getClient();
			const allCategories = await this.collectPaged<any>((query) =>
				fz.giftcards.categories(query),
			);
			const categories = this.filterParents(
				allCategories,
				(category) => category.name,
				options.nameFilter,
			);

			const perCategory = await this.mapWithConcurrency(
				categories,
				OFFER_CONCURRENCY,
				async (category) => {
					const items: FazercardsCatalogItem[] = [];
					const offers = await this.fetchOffers(
						`giftcards/${category.category_id}`,
						() => fz.giftcards.cards(category.category_id),
					);

					for (const offer of offers?.offers ?? []) {
						// A null card_id marks a misconfigured offer that cannot be ordered.
						if (!offer.card_id) continue;
						items.push({
							type: "giftcard",
							id: `${category.category_id}:${offer.card_id}`,
							name: joinName(category.name, offer.name),
							categoryId: category.category_id,
							cardId: offer.card_id,
							priceUsd: offer.price_usd,
							stock: offer.stock,
							raw: { category, offer },
						});
					}
					return items;
				},
			);

			const items = perCategory.flat();
			this.logger.log(
				`Fetched ${items.length} FazerCards gift cards from ${categories.length}/${allCategories.length} categories`,
			);
			return items;
		} catch (err) {
			this.logger.error(
				"Failed to fetch FazerCards gift cards",
				(err as Error)?.stack,
			);
			throw err;
		}
	}

	/**
	 * Fetch FazerCards game key catalog: every game, then every key position
	 * (`keys`) inside it.
	 */
	async getFzrGameKeys(
		options: CatalogFetchOptions = {},
	): Promise<FazercardsCatalogItem[]> {
		try {
			const fz = this.fzrService.getClient();
			const allGames = await this.collectPaged<any>((query) =>
				fz.gamekeys.games(query),
			);
			const games = this.filterParents(
				allGames,
				(game) => game.name,
				options.nameFilter,
			);

			const perGame = await this.mapWithConcurrency(
				games,
				OFFER_CONCURRENCY,
				async (game) => {
					const items: FazercardsCatalogItem[] = [];
					const offers = await this.fetchOffers(
						`gamekeys/${game.game_id}`,
						() => fz.gamekeys.keys(game.game_id),
					);

					for (const key of offers?.keys ?? []) {
						if (!key.key_id) continue;
						items.push({
							type: "gamekey",
							id: `${game.game_id}:${key.key_id}`,
							name: joinName(game.name, key.name),
							gameId: game.game_id,
							keyId: key.key_id,
							priceUsd: key.price_usd,
							stock: key.stock,
							raw: { game, key },
						});
					}
					return items;
				},
			);

			const items = perGame.flat();
			this.logger.log(
				`Fetched ${items.length} FazerCards game keys from ${games.length}/${allGames.length} games`,
			);
			return items;
		} catch (err) {
			this.logger.error(
				"Failed to fetch FazerCards game keys",
				(err as Error)?.stack,
			);
			throw err;
		}
	}

	/**
	 * Fetch FazerCards top-up catalog: every category, then every offer inside it.
	 */
	async getFzrTopups(
		options: CatalogFetchOptions = {},
	): Promise<FazercardsCatalogItem[]> {
		try {
			const fz = this.fzrService.getClient();
			const allCategories = await this.collectPaged<any>((query) =>
				fz.topups.categories(query),
			);
			const categories = this.filterParents(
				allCategories,
				(category) => category.name,
				options.nameFilter,
			);

			const perCategory = await this.mapWithConcurrency(
				categories,
				OFFER_CONCURRENCY,
				async (category) => {
					const items: FazercardsCatalogItem[] = [];
					const offers = await this.fetchOffers(
						`topups/${category.category_id}`,
						() => fz.topups.offers(category.category_id),
					);

					for (const offer of offers?.offers ?? []) {
						if (!offer.offer_id) continue;
						items.push({
							type: "topup",
							id: `${category.category_id}:${offer.offer_id}`,
							name: joinName(category.name, offer.name),
							categoryId: category.category_id,
							priceUsd: offer.price_usd,
							raw: { category, offer, fields: offers?.fields ?? [] },
						});
					}
					return items;
				},
			);

			const items = perCategory.flat();
			this.logger.log(
				`Fetched ${items.length} FazerCards topups from ${categories.length}/${allCategories.length} categories`,
			);
			return items;
		} catch (err) {
			this.logger.error(
				"Failed to fetch FazerCards topups",
				(err as Error)?.stack,
			);
			throw err;
		}
	}

	/**
	 * FazerCards account order history — the articles you already bought.
	 *
	 * Walks completed orders and extracts the delivered product from each:
	 *   - gift_card  → category_id + card_id
	 *   - topup      → category_id + offer_id
	 *   - game_key   → key_id (note: OrderResource does not carry game_id, so
	 *                  gameId will be undefined; complete it in the admin UI)
	 *
	 * This is the fast path for sync: no catalog walk, only your own orders.
	 */
	async getFzrPurchasedItems(
		options: { maxOrders?: number } = {},
	): Promise<FazercardsCatalogItem[]> {
		const fz = this.fzrService.getClient();
		const items: FazercardsCatalogItem[] = [];
		const seen = new Set<string>();
		let ordersScanned = 0;

		for await (const order of fz.orders.iterAll({ limit: 50 })) {
			ordersScanned++;
			if (ordersScanned > (options.maxOrders ?? 500)) break;

			// Only delivered orders represent a purchased article.
			if (order.status !== 'completed') continue;

			const dedupeKey = `${order.kind}:${order.category_id ?? ''}:${order.card_id ?? ''}:${order.key_id ?? ''}:${order.offer_id ?? ''}`;
			if (seen.has(dedupeKey)) continue;
			seen.add(dedupeKey);

			let type: FazercardsCatalogItem['type'];
			let categoryId: string | undefined;
			let cardId: string | undefined;
			let gameId: string | undefined;
			let keyId: string | undefined;
			let offerId: string | undefined;
			let name: string | undefined;

			switch (order.kind) {
				case 'gift_card':
					type = 'giftcard';
					categoryId = order.category_id;
					cardId = order.card_id;
					name =
						order.title ??
						order.offer_name ??
						order.category_name ??
						order.id;
					break;
				case 'topup':
					type = 'topup';
					categoryId = order.category_id;
					offerId = order.offer_id;
					name =
						order.title ??
						order.offer_name ??
						order.category_name ??
						order.id;
					break;
				case 'game_key':
					type = 'gamekey';
					keyId = order.key_id;
					// OrderResource does not carry game_id — left undefined.
					name = order.title ?? order.offer_name ?? order.id;
					break;
				default:
					continue;
			}

			const catalogId =
				type === 'topup'
					? `${categoryId}:${offerId ?? order.id}`
					: type === 'gamekey'
						? `${gameId ?? order.id}:${keyId ?? order.id}`
						: `${categoryId}:${cardId ?? order.id}`;

			items.push({
				type,
				id: catalogId,
				name,
				categoryId,
				cardId,
				gameId,
				keyId,
				raw: { order },
			});
		}

		this.logger.log(
			`Fetched ${items.length} FazerCards purchased articles from ${ordersScanned} orders`,
		);
		return items;
	}

	/** Walk a cursor-paginated listing, pacing requests against the rate limit. */
	private async collectPaged<T>(
		fetchPage: (query: { limit: number; cursor?: string }) => Promise<{
			items?: T[];
			meta?: { next_cursor?: string };
		}>,
	): Promise<T[]> {
		const items: T[] = [];
		let cursor: string | undefined;

		do {
			const page = await this.paced(() =>
				fetchPage({ limit: PAGE_LIMIT, cursor }),
			);
			items.push(...(page?.items ?? []));
			cursor = page?.meta?.next_cursor;
		} while (cursor);

		return items;
	}

	/** Drop parents (categories/games) that cannot match any Ozon product. */
	private filterParents<T>(
		parents: T[],
		getName: (parent: T) => string | undefined,
		nameFilter?: (parentName: string) => boolean,
	): T[] {
		if (!nameFilter) return parents;
		return parents.filter((parent) => {
			const name = getName(parent);
			return !!name && nameFilter(name);
		});
	}

	/**
	 * Fetch the offers of one category/game. A single broken category should not
	 * abort the whole catalog, so failures are logged and treated as empty.
	 */
	private async fetchOffers(
		label: string,
		load: () => Promise<any>,
	): Promise<any | undefined> {
		try {
			return await this.paced(load);
		} catch (err) {
			this.logger.warn(
				`Failed to fetch FazerCards offers for ${label}: ${(err as Error)?.message}`,
			);
			return undefined;
		}
	}

	/** Run one catalog request, waiting for a free slot in the rate budget. */
	private async paced<T>(request: () => Promise<T>): Promise<T> {
		await this.limiter.acquire();
		return request();
	}

	/** Run `fn` over `items` with at most `limit` concurrent calls. */
	private async mapWithConcurrency<T, R>(
		items: T[],
		limit: number,
		fn: (item: T) => Promise<R>,
	): Promise<R[]> {
		const results: R[] = new Array(items.length);
		let next = 0;

		const worker = async (): Promise<void> => {
			while (next < items.length) {
				const index = next++;
				results[index] = await fn(items[index]);
			}
		};

		const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
			worker(),
		);
		await Promise.all(workers);
		return results;
	}
}

/** Compose a searchable product name out of the parent and the offer name. */
function joinName(parent?: string, child?: string): string {
	return [parent, child]
		.filter((part) => !!part && part.trim() !== "")
		.join(" — ");
}

/** Simple client-side token bucket: one request per `minIntervalMs`. */
class RateLimiter {
	private nextSlot = 0;

	constructor(private readonly minIntervalMs: number) {}

	async acquire(): Promise<void> {
		const now = Date.now();
		const slot = Math.max(now, this.nextSlot);
		this.nextSlot = slot + this.minIntervalMs;

		const wait = slot - now;
		if (wait > 0) {
			await new Promise((resolve) => setTimeout(resolve, wait));
		}
	}
}

