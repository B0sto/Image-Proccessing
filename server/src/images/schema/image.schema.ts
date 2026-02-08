import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  HydratedDocument,
  Schema as MongooseSchema,
  SchemaTypes,
  Types,
} from 'mongoose';

export type ImageDocument = HydratedDocument<Image>;

@Schema({ _id: false })
export class ImageVariant {
  @Prop({ required: true })
  hash: string;

  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  contentType: string;

  @Prop({ required: true })
  format: string;

  @Prop({ required: true })
  size: number;

  @Prop({ type: Number })
  width?: number;

  @Prop({ type: Number })
  height?: number;

  @Prop({ type: SchemaTypes.Mixed, required: true })
  transformations: Record<string, unknown>;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const imageVariantSchema = SchemaFactory.createForClass(ImageVariant);

@Schema({ timestamps: true })
export class Image {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'user',
    required: true,
    index: true,
  })
  owner: Types.ObjectId;

  @Prop({ required: true })
  originalKey: string;

  @Prop({ required: true })
  originalName: string;

  @Prop({ required: true })
  contentType: string;

  @Prop({ required: true })
  format: string;

  @Prop({ required: true })
  size: number;

  @Prop({ type: Number })
  width?: number;

  @Prop({ type: Number })
  height?: number;

  @Prop({ type: [imageVariantSchema], default: [] })
  variants: ImageVariant[];

  createdAt?: Date;
  updatedAt?: Date;
}


export const imageSchema = SchemaFactory.createForClass(Image);
