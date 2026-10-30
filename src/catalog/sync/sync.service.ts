import { Injectable, Logger } from "@nestjs/common";
import { MappingService } from "../mapping/mapping.service";
import { SupplierFactory } from "../../suppliers/supplier.factory";
import { SupplierType } from "../../suppliers/supplier.interface";
import {
	SyncOptions,
	SyncResult,
	SyncMappingResult,
	SyncError,
	DigitalProductConfigForSync,
	MatchStrategy,
	ProductWithScore,
} from "./sync.dto";
import { CatalogService, OzonProductSummary } from "../catalog.service";

/**
 * Sync service: pulls Ozon products, matches them against supplier catalog
 * articles, and stores the mappings in MongoDB.
 *
 * By default the sync only considers articles you have already bought from
 * the configured supplier (order history) — fast, no full catalog walk.
 *
 * Matching logic:
 *   - 'exact': Ozon product name == supplier product name
 *   - 'name': keyword overlap — pick the best match
 *   - 'none': no auto-matching
 */
@Injectable()
export class CatalogSyncService {
	private readonly logger = new Logger(CatalogSyncService.name);

	constructor(
		private readonly mapping: MappingService,
		private readonly catalog: CatalogService,
		private readonly supplierFactory: SupplierFactory,
	) {}

	/**
	 * Full sync: fetch Ozon products, match against supplier candidates,
	 * and upsert mappings to MongoDB.
	 */
	async sync(options: SyncOptions = {}): Promise<SyncResult> {
		const matchStrategy = options.matchStrategy ?? "name";
		const limit = options.limit ?? 100;
		const dryRun = options.dryRun ?? false;
		const supplierType = options.supplier ?? SupplierType.FAZERCARDS;

		this.logger.log(
			`Starting catalog sync: supplier=${supplierType}, strategy=${matchStrategy}, limit=${limit}, dryRun=${dryRun}`,
		);

		// 1. Fetch Ozon products (shared with the admin catalog UI).
		let ozonProducts: OzonProductSummary[] = [];
		try {
			ozonProducts = await this.catalog.getOzonProducts();
		} catch (err) {
			this.logger.error("Failed to fetch Ozon catalog", (err as Error)?.stack);
			return {
				totalOzonProducts: 0,
				totalSupplierProducts: 0,
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

		// 2. Build the supplier candidate list from order history.
		let supplierProducts: DigitalProductConfigForSync[] = [];
		try {
			const supplier = this.supplierFactory.get(supplierType);
			const catalog = await supplier.fetchCatalog({
				maxOrders: options.maxOrders ?? 500,
			});
			supplierProducts = catalog.map((item) => ({
				supplier: item.supplier,
				type: item.type ?? '',
				catalogId: item.id,
				name: item.name,
				priceUsd: item.priceUsd,
				stock: item.stock,
				config: item.config,
				quantity: 1,
				label: item.name ?? item.id,
			}));
			this.logger.log(
				`Using ${supplierProducts.length} purchased articles from supplier '${supplierType}' order history`,
			);
		} catch (err) {
			this.logger.error(
				"Failed to build supplier candidate list",
				(err as Error)?.stack,
			);
			return {
				totalOzonProducts: ozonProducts.length,
				totalSupplierProducts: 0,
				synced: 0,
				matched: 0,
				unmatched: ozonProducts.length,
				skipped: 0,
				mappings: [],
				errors: [
					{
						message: `Supplier candidate list failed: ${(err as Error)?.message}`,
					},
				],
			};
		}

		this.logger.log(
			`Fetched ${ozonProducts.length} Ozon products and ${supplierProducts.length} supplier candidates.`,
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

			let match: ProductWithScore | undefined;

			if (matchStrategy === "exact") {
				match = this.matchExact(name, supplierProducts);
			} else if (matchStrategy === "name") {
				match = this.matchByName(name, supplierProducts);
			}

			if (match) {
				matched++;
				const config = this.buildSupplierConfig(match.product);
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
			totalSupplierProducts: supplierProducts.length,
			synced,
			matched,
			unmatched,
			skipped,
			mappings,
			errors,
		};
	}

	/**
	 * Exact match: Ozon name equals supplier product name (case-insensitive, trimmed).
	 */
	private matchExact(
		ozonName: string,
		products: DigitalProductConfigForSync[],
	): ProductWithScore | undefined {
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
	 * Keyword overlap match: extract keywords from Ozon name, score each supplier
	 * product by how many keywords appear in its name.
	 */
	private matchByName(
		ozonName: string,
		products: DigitalProductConfigForSync[],
	): ProductWithScore | undefined {
		const keywords = this.extractKeywords(ozonName);
		if (keywords.length === 0) return undefined;

		let best: ProductWithScore | undefined;

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
				const candidate: ProductWithScore = {
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
	 * Convert a supplier catalog item into a DigitalProductConfigForSync.
	 */
	private buildSupplierConfig(
		p: DigitalProductConfigForSync,
	): DigitalProductConfigForSync {
		return {
			supplier: p.supplier ?? SupplierType.FAZERCARDS,
			type: p.type,
			quantity: p.quantity ?? 1,
			label: p.label ?? p.name ?? p.catalogId,
			catalogId: p.catalogId,
			name: p.name,
			priceUsd: p.priceUsd,
			stock: p.stock,
			config: p.config ?? {},
		};
	}
}
