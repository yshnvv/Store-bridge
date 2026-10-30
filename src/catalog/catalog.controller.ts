import {
  Controller,
  Get,
  Post,
  Body,
  Delete,
  Param,
  Logger,
  Query,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { MappingService } from './mapping/mapping.service';
import { ProductMappingEntity } from './mapping/mapping.entity';
import { FazercardsProductConfig as FzrProductConfig } from '../config/product-mapping';
import { SupplierFactory } from '../suppliers/supplier.factory';
import { SupplierType } from '../suppliers/supplier.interface';

@Controller('admin/catalog')
export class CatalogController {
  private readonly logger = new Logger(CatalogController.name);

  constructor(
    private readonly catalog: CatalogService,
    private readonly mapping: MappingService,
    private readonly supplierFactory: SupplierFactory,
  ) {}

  @Get('ozon')
  async getOzonProducts() {
    return this.catalog.getOzonProducts();
  }

  /**
   * Fetch purchased catalog items from a specific supplier.
   * Default: fazercards.
   */
  @Get(':supplier/purchased')
  async getFzrPurchased(
    @Param('supplier') supplierParam: string,
    @Query('maxOrders') maxOrders?: string,
  ) {
    const supplierType = supplierParam as SupplierType;
    const supplier = this.supplierFactory.get(supplierType);
    return supplier.fetchCatalog({
      maxOrders: maxOrders ? Number(maxOrders) : undefined,
    });
  }

  /** Backward-compatible alias for FazerCards. */
  @Get('fazercards/purchased')
  async getFazercardsPurchased(@Query('maxOrders') maxOrders?: string) {
    return this.getFzrPurchased('fazercards', maxOrders);
  }

  @Get('mapping')
  async getMapping(): Promise<ProductMappingEntity[]> {
    return this.mapping.getAll();
  }

  @Post('mapping')
  async setMapping(
    @Body()
    body: { ozonOfferId: string; fazercardsConfig: FzrProductConfig },
  ): Promise<ProductMappingEntity> {
    return this.mapping.set(body.ozonOfferId, body.fazercardsConfig);
  }

  @Delete('mapping/:ozonOfferId')
  async deleteMapping(@Param('ozonOfferId') ozonOfferId: string): Promise<void> {
    return this.mapping.delete(ozonOfferId);
  }
}
