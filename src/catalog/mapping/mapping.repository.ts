import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ProductMappingEntity,
  ProductMappingDocument,
} from './mapping.entity';
import { FazercardsProductConfig } from '../../config/product-mapping';

/**
 * MongoDB-backed mapping repository.
 * Persists Ozon offer_id → FazerCards product config across restarts.
 */
@Injectable()
export class MappingRepository {
  private readonly logger = new Logger(MappingRepository.name);

  constructor(
    @InjectModel(ProductMappingEntity.name)
    private readonly mappingModel: Model<ProductMappingDocument>,
  ) {}

  async findByOzonOfferId(
    ozonOfferId: string,
  ): Promise<FazercardsProductConfig | undefined> {
    const doc = await this.mappingModel
      .findOne({ ozonOfferId })
      .lean()
      .exec();
    return doc?.fazercardsConfig;
  }

  async findAll(): Promise<
    Array<{
      id: string;
      ozonOfferId: string;
      fazercardsConfig: FazercardsProductConfig;
      createdAt?: Date;
      updatedAt?: Date;
    }>
  > {
    const docs = await this.mappingModel.find().lean().exec();
    return docs.map((doc) => ({
      id: doc._id.toString(),
      ozonOfferId: doc.ozonOfferId,
      fazercardsConfig: doc.fazercardsConfig,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));
  }

  async upsert(
    ozonOfferId: string,
    config: FazercardsProductConfig,
  ): Promise<{
    id: string;
    ozonOfferId: string;
    fazercardsConfig: FazercardsProductConfig;
    createdAt?: Date;
    updatedAt?: Date;
  }> {
    const doc = await this.mappingModel
      .findOneAndUpdate(
        { ozonOfferId },
        { ozonOfferId, fazercardsConfig: config },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean()
      .exec();

    this.logger.log(
      `Mapping saved: ${ozonOfferId} → ${config.label ?? '(no label)'}`,
    );

    return {
      id: doc._id.toString(),
      ozonOfferId: doc.ozonOfferId,
      fazercardsConfig: doc.fazercardsConfig,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async delete(ozonOfferId: string): Promise<boolean> {
    const result = await this.mappingModel
      .deleteOne({ ozonOfferId })
      .exec();
    return result.deletedCount > 0;
  }

  async count(): Promise<number> {
    return this.mappingModel.countDocuments().exec();
  }
}
