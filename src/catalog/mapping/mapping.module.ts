import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MappingService } from './mapping.service';
import { MappingRepository } from './mapping.repository';
import {
  ProductMappingEntity,
  ProductMappingSchema,
} from './mapping.entity';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProductMappingEntity.name, schema: ProductMappingSchema },
    ]),
  ],
  providers: [MappingRepository, MappingService],
  exports: [MappingService, MappingRepository],
})
export class MappingModule {}
