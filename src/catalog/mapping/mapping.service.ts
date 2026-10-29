import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FazercardsProductConfig } from '../../config/product-mapping';
import { MappingRepository } from './mapping.repository';

export interface StoredMapping {
  id: string;
  ozonOfferId: string;
  fazercardsConfig: FazercardsProductConfig;
  createdAt?: Date;
  updatedAt?: Date;
}

@Injectable()
export class MappingService {
  private readonly logger = new Logger(MappingService.name);

  constructor(private readonly repository: MappingRepository) {}

  async get(ozonOfferId: string): Promise<FazercardsProductConfig | undefined> {
    return this.repository.findByOzonOfferId(ozonOfferId);
  }

  async getAll(): Promise<StoredMapping[]> {
    return this.repository.findAll();
  }

  async set(
    ozonOfferId: string,
    config: FazercardsProductConfig,
  ): Promise<StoredMapping> {
    return this.repository.upsert(ozonOfferId, config);
  }

  async delete(ozonOfferId: string): Promise<void> {
    const deleted = await this.repository.delete(ozonOfferId);
    if (!deleted) {
      throw new NotFoundException(
        `No mapping found for Ozon offer ${ozonOfferId}`,
      );
    }
  }

  async has(ozonOfferId: string): Promise<boolean> {
    return (await this.repository.findByOzonOfferId(ozonOfferId)) !== undefined;
  }
}
