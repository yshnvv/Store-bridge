import { forwardRef, Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { MappingModule } from './mapping/mapping.module';
import { OzonModule } from '../ozon/ozon.module';
import { FzrModule } from '../fazercards/fazercards.module';
import { SuppliersModule } from '../suppliers/suppliers.module';

@Module({
  imports: [
    MappingModule,
    forwardRef(() => OzonModule),
    FzrModule,
    SuppliersModule,
  ],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService, MappingModule],
})
export class CatalogModule {}
