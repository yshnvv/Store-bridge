import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { FazercardsProductConfig } from '../../config/product-mapping';

export type ProductMappingDocument = ProductMappingEntity & Document;

@Schema({ timestamps: true, collection: 'product_mappings' })
export class ProductMappingEntity {
  @Prop({ required: true, unique: true, index: true })
  ozonOfferId: string;

  @Prop({ required: true, type: Object })
  fazercardsConfig: FazercardsProductConfig;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const ProductMappingSchema =
  SchemaFactory.createForClass(ProductMappingEntity);
