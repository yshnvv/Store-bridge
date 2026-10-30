import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupplierFactory, SUPPLIER_LIST } from './supplier.factory';
import { FazerCardsSupplierService } from './fazercards/fazercards-supplier.service';
import { FzrModule } from '../fazercards/fazercards.module';

@Module({
  imports: [ConfigModule, FzrModule],
  providers: [
    SupplierFactory,
    FazerCardsSupplierService,
    {
      provide: SUPPLIER_LIST,
      useFactory: (fzr: FazerCardsSupplierService) => [fzr],
      inject: [FazerCardsSupplierService],
    },
  ],
  exports: [SupplierFactory],
})
export class SuppliersModule {}
