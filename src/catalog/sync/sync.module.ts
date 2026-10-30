import { Module } from '@nestjs/common';
import { CatalogSyncController } from './sync.controller';
import { CatalogSyncService } from './sync.service';
import { CatalogModule } from '../catalog.module';
import { MappingModule } from '../mapping/mapping.module';
import { SuppliersModule } from '../../suppliers/suppliers.module';

@Module({
  imports: [CatalogModule, MappingModule, SuppliersModule],
  controllers: [CatalogSyncController],
  providers: [CatalogSyncService],
  exports: [CatalogSyncService],
})
export class CatalogSyncModule {}
