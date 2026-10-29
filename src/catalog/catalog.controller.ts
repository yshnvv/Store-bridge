import {
  Controller,
  Get,
  Post,
  Body,
  Delete,
  Param,
  Logger,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { MappingService } from './mapping/mapping.service';
import { ProductMappingEntity } from './mapping/mapping.entity';
import { FazercardsProductConfig as FzrProductConfig } from '../config/product-mapping';

@Controller('admin/catalog')
export class CatalogController {
  private readonly logger = new Logger(CatalogController.name);

  constructor(
    private readonly catalog: CatalogService,
    private readonly mapping: MappingService,
  ) {}

  @Get('ozon')
  async getOzonProducts() {
    return this.catalog.getOzonProducts();
  }

  @Get('fazercards/giftcards')
  async getFzrGiftcards() {
    return this.catalog.getFzrGiftcards();
  }

  @Get('fazercards/gamekeys')
  async getFzrGameKeys() {
    return this.catalog.getFzrGameKeys();
  }

  @Get('fazercards/topups')
  async getFzrTopups() {
    return this.catalog.getFzrTopups();
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
