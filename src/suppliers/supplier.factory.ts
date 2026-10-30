import { Injectable, Inject, OnModuleInit, NotFoundException } from '@nestjs/common';
import { DigitalProductSupplier, SupplierType } from './supplier.interface';

export const SUPPLIER_LIST = 'SUPPLIER_LIST';

/**
 * Registry of digital product suppliers.
 *
 * Suppliers are registered via the `SUPPLIER_LIST` injection token in the
 * module that composes them (e.g. SuppliersModule). Call `get(type)` to obtain
 * the supplier that handles a given mapping.
 */
@Injectable()
export class SupplierFactory implements OnModuleInit {
  private readonly suppliers = new Map<SupplierType, DigitalProductSupplier>();

  constructor(
    @Inject(SUPPLIER_LIST) private readonly suppliersList: DigitalProductSupplier[],
  ) {}

  onModuleInit(): void {
    for (const s of this.suppliersList) {
      this.suppliers.set(s.supplier, s);
    }
  }

  get(supplierType: SupplierType): DigitalProductSupplier {
    const supplier = this.suppliers.get(supplierType);
    if (!supplier) {
      throw new NotFoundException(
        `No digital product supplier registered for '${supplierType}'.`,
      );
    }
    return supplier;
  }

  getRegisteredTypes(): SupplierType[] {
    return Array.from(this.suppliers.keys());
  }
}
