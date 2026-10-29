import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { MappingModule } from './mapping/mapping.module';
import { OzonModule } from '../ozon/ozon.module';
import { FzrModule } from '../fazercards/fazercards.module';

@Module({
  imports: [MappingModule, OzonModule, FzrModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService, MappingModule],
})
export class CatalogModule {}
