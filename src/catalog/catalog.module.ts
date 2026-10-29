import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { MappingModule } from './mapping/mapping.module';

@Module({
  imports: [MappingModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService, MappingModule],
})
export class CatalogModule {}
