import { Injectable, Logger } from "@nestjs/common";
import { MappingService } from "../mapping/mapping.service";
import {
	SyncOptions,
	SyncResult,
	SyncMappingResult,
	SyncError,
	FazercardsProductConfigForSync,
	MatchStrategy,
	FzrProductWithScore,
} from "./sync.dto";
import {
	CatalogService,
	FazercardsCatalogItem,
	OzonProductSummary,
} from "../catalog.service";

/**
 * Sync service: pulls catalogs from Ozon and FazerCards, auto-matches
 * products by name, and stores mappings in MongoDB.
 *
 * Matching logic:
 *   - 'exact': Ozon product name == FazerCards product name (case-insensitive, trimmed)
 *   - 'name': keyword overlap — extract keywords from Ozon name, count how many
 *     appear in each FazerCards product name, pick the best match
 *   - 'none': no auto-matching, returns all Ozon products as unmatched
 */
@Injectable()
export class CatalogSyncService {
	private readonly logger = new Logger(CatalogSyncService.name);

	constructor(
		private readonly mapping: MappingService,
		private readonly catalog: CatalogService,
	) {}

	/**
	 * Full sync: fetch both catalogs, match, and upsert mappings to MongoDB.
	 */
	async sync(options: SyncOptions = {}): Promise<SyncResult> {
		const matchStrategy = options.matchStrategy ?? "name";
		const limit = options.limit ?? 100;
		const dryRun = options.dryRun ?? false;

		this.logger.log(
			`Starting catalog sync: strategy=${matchStrategy}, limit=${limit}, dryRun=${dryRun}`,
		);

		// 1. Fetch Ozon products (shared with the admin catalog UI, so both see
		// the same list, including any test fixtures).
		let ozonProducts: OzonProductSummary[] = [];
		try {
			ozonProducts = await this.catalog.getOzonProducts();
		} catch (err) {
			this.logger.error("Failed to fetch Ozon catalog", (err as Error)?.stack);
			return {
				totalOzonProducts: 0,
				totalFzrProducts: 0,
				synced: 0,
				matched: 0,
				unmatched: 0,
				skipped: 0,
				mappings: [],
				errors: [
					{ message: `Ozon catalog fetch failed: ${(err as Error)?.message}` },
				],
			};
		}

		console.log(`Fetched ${ozonProducts.length} Ozon products.`);
		// 2. Fetch all FazerCards catalogs.
		// Only categories/games whose name appears in an Ozon product name are
		// fetched — the rest could never be matched and each one costs an API call.
		let fzrProducts: FazercardsCatalogItem[] = [];
		try {
			const sources = options.sources ?? ["giftcards", "gamekeys", "topups"];
			const nameFilter = options.fullCatalog
				? undefined
				: this.buildParentMatcher(ozonProducts.map((p) => p.name ?? ""));

			this.logger.log(
				`Fetching FazerCards catalog: sources=${sources.join(",")}, filter=${nameFilter ? "ozon-names" : "off"}`,
			);

			const [giftcards, gamekeys, topups] = await Promise.all([
				sources.includes("giftcards")
					? this.catalog.getFzrGiftcards({ nameFilter })
					: Promise.resolve([]),
				sources.includes("gamekeys")
					? this.catalog.getFzrGameKeys({ nameFilter })
					: Promise.resolve([]),
				sources.includes("topups")
					? this.catalog.getFzrTopups({ nameFilter })
					: Promise.resolve([]),
			]);

			fzrProducts = [...giftcards, ...gamekeys, ...topups];

			console.log(fzrProducts);
		} catch (err) {
			this.logger.error(
				"Failed to fetch FazerCards catalog",
				(err as Error)?.stack,
			);
			return {
				totalOzonProducts: ozonProducts.length,
				totalFzrProducts: 0,
				synced: 0,
				matched: 0,
				unmatched: ozonProducts.length,
				skipped: 0,
				mappings: [],
				errors: [
					{
						message: `FazerCards catalog fetch failed: ${(err as Error)?.message}`,
					},
				],
			};
		}

		console.log(
			`Fetched ${ozonProducts.length} Ozon products and ${fzrProducts.length} FazerCards products.`,
		);

		// 3. Limit Ozon products
		const limitedOzon = ozonProducts.slice(0, limit);

		// 4. Match and build results
		const mappings: SyncMappingResult[] = [];
		const errors: SyncError[] = [];
		let matched = 0;
		let unmatched = 0;
		let skipped = 0;
		let synced = 0;

		for (const oz of limitedOzon) {
			const offerId = oz.offer_id;
			const name = oz.name ?? "";

			if (!offerId) {
				skipped++;
				errors.push({ ozonProductName: name, message: "Missing offer_id" });
				continue;
			}

			let match: FzrProductWithScore | undefined;

			if (matchStrategy === "exact") {
				match = this.matchExact(name, fzrProducts);
			} else if (matchStrategy === "name") {
				match = this.matchByName(name, fzrProducts);
			}

			if (match) {
				matched++;
				const config = this.buildFzrConfig(match.product);
				const result: SyncMappingResult = {
					ozonOfferId: offerId,
					ozonProductName: name,
					fazercardsConfig: config,
					matchStrategy,
					matchScore: match.score,
					matchedFzrProductName: match.product.name,
					saved: false,
				};

				if (!dryRun) {
					try {
						await this.mapping.set(offerId, config);
						result.saved = true;
						synced++;
					} catch (err) {
						errors.push({
							ozonOfferId: offerId,
							ozonProductName: name,
							message: `Failed to save mapping: ${(err as Error)?.message}`,
						});
					}
				} else {
					synced++;
				}

				mappings.push(result);
			} else {
				unmatched++;
				mappings.push({
					ozonOfferId: offerId,
					ozonProductName: name,
					fazercardsConfig: undefined,
					matchStrategy,
					matchedFzrProductName: undefined,
					saved: false,
				});
			}
		}

		return {
			totalOzonProducts: ozonProducts.length,
			totalFzrProducts: fzrProducts.length,
			synced,
			matched,
			unmatched,
			skipped,
			mappings,
			errors,
		};
	}

	/**
	 * Exact match: Ozon name equals FazerCards name (case-insensitive, trimmed).
	 */
	private matchExact(
		ozonName: string,
		products: FazercardsCatalogItem[],
	): FzrProductWithScore | undefined {
		const normalized = ozonName.trim().toLowerCase();
		for (const p of products) {
			const pName = (p.name ?? "").trim().toLowerCase();
			if (pName === normalized) {
				return { product: p, score: 100, matchedKeywords: [normalized] };
			}
		}
		return undefined;
	}

	/**
	 * Keyword overlap match: extract keywords from Ozon name, score each FazerCards
	 * product by how many keywords appear in its name.
	 */
	private matchByName(
		ozonName: string,
		products: FazercardsCatalogItem[],
	): FzrProductWithScore | undefined {
		const keywords = this.extractKeywords(ozonName);
		if (keywords.length === 0) return undefined;

		let best: FzrProductWithScore | undefined;

		for (const p of products) {
			const pName = (p.name ?? "").toLowerCase();
			const matched: string[] = [];
			let score = 0;

			for (const kw of keywords) {
				if (pName.includes(kw)) {
					matched.push(kw);
					score += kw.length;
				}
			}

			if (matched.length > 0) {
				const candidate: FzrProductWithScore = {
					product: p,
					score,
					matchedKeywords: matched,
				};
				if (!best || candidate.score > best.score) {
					best = candidate;
				}
			}
		}

		return best;
	}

	/**
	 * Build a predicate that keeps only FazerCards categories/games that can
	 * plausibly match an Ozon product. This is what makes the sync fast: it
	 * avoids fetching offers for the hundreds of games we don't sell.
	 *
	 * Only alphabetic words are used (length >= 3), so denominations like
	 * "1000" or "RUB" don't match a category name. Words also match with a
	 * small edit distance, because Ozon names use the currency/product word
	 * while FazerCards uses the brand: "4500 Robux" → category "Roblox".
	 */
	private buildParentMatcher(
		ozonNames: string[],
	): ((parentName: string) => boolean) | undefined {
		const tokens = new Set<string>();
		for (const name of ozonNames) {
			for (const kw of this.extractKeywords(name)) {
				if (/^\p{L}{3,}$/u.test(kw)) tokens.add(kw);
			}
		}

		if (tokens.size === 0) {
			this.logger.warn(
				"No usable words in Ozon product names; FazerCards catalog filtering is disabled",
			);
			return undefined;
		}

		const needles = [...tokens];

		return (parentName: string): boolean => {
			const words = this.extractKeywords(parentName);
			for (const word of words) {
				for (const needle of needles) {
					if (
						word.includes(needle) ||
						needle.includes(word) ||
						isNearWord(needle, word)
					) {
						return true;
					}
				}
			}
			return false;
		};
	}

	/**
	 * Extract meaningful keywords (length >= 3) from a product name.
	 * Uses Unicode letters so Cyrillic names (Ozon) are not stripped.
	 */
	private extractKeywords(name: string): string[] {
		const cleaned = (name ?? "")
			.toLowerCase()
			.replace(/[^\p{L}\p{N}\s]/gu, " ")
			.replace(/\s+/g, " ")
			.trim();

		return cleaned
			.split(" ")
			.filter((w) => w.length >= 3)
			.filter((w, i, arr) => arr.indexOf(w) === i);
	}

	/**
	 * Convert a FazerCards catalog item into a FazercardsProductConfigForSync.
	 */
	private buildFzrConfig(
		p: FazercardsCatalogItem,
	): FazercardsProductConfigForSync {
		const config: FazercardsProductConfigForSync = {
			type: p.type,
			quantity: 1,
			label: p.name ?? p.id,
			catalogId: p.id,
			name: p.name,
			priceUsd: p.priceUsd,
			stock: p.stock,
		};

		if (p.type === "giftcard") {
			config.categoryId = p.categoryId;
			config.cardId = p.cardId;
		} else if (p.type === "gamekey") {
			config.gameId = p.gameId;
			config.keyId = p.keyId;
		} else if (p.type === "topup") {
			config.categoryId = p.categoryId;
			config.gameId = p.gameId;
		}

		return config;
	}
}

/**
 * True when two words are the same up to a couple of typos, e.g.
 * "robux" vs "roblox". The first letter and length are cheap pre-filters so
 * this stays fast when comparing hundreds of tokens against a catalog.
 */
function isNearWord(a: string, b: string): boolean {
	if (a === b) return true;
	if (a[0] !== b[0]) return false;
	if (Math.abs(a.length - b.length) > 2) return false;

	const maxDistance = Math.min(a.length, b.length) <= 4 ? 1 : 2;
	return levenshtein(a, b, maxDistance) <= maxDistance;
}

/** Levenshtein distance, aborting as soon as it cannot be <= `max`. */
function levenshtein(a: string, b: string, max: number): number {
	let previous: number[] = [];
	for (let j = 0; j <= b.length; j++) previous[j] = j;

	for (let i = 1; i <= a.length; i++) {
		const current: number[] = [i];
		let rowMin = i;

		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			current[j] = Math.min(
				previous[j] + 1,
				current[j - 1] + 1,
				previous[j - 1] + cost,
			);
			if (current[j] < rowMin) rowMin = current[j];
		}

		if (rowMin > max) return max + 1;
		previous = current;
	}

	return previous[b.length];
}

