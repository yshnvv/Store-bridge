import { Module } from '@nestjs/common';
import { CatalogSyncController } from './sync.controller';
import { CatalogSyncService } from './sync.service';
import { CatalogModule } from '../catalog.module';
import { MappingModule } from '../mapping/mapping.module';

@Module({
  imports: [CatalogModule, MappingModule],
  controllers: [CatalogSyncController],
  providers: [CatalogSyncService],
  exports: [CatalogSyncService],
})
export class CatalogSyncModule {}
