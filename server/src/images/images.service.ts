import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Express } from 'express';
import { Model, Types } from 'mongoose';
import sharp, { Sharp } from 'sharp';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { FinalizeUploadDto } from './dto/finalize-upload.dto';
import { RetrieveImageQueryDto } from './dto/retrieve-image-query.dto';
import {
  SUPPORTED_IMAGE_FORMATS,
  SupportedImageFormat,
  TransformImageDto,
  TransformationsDto,
} from './dto/transform-image.dto';
import { ImageStorageService } from './image-storage.service';
import { Image, ImageDocument, ImageVariant } from './schema/image.schema';

interface BinaryImageResult {
  buffer: Buffer;
  contentType: string;
  fileName: string;
}

export interface TransformVariantResponse {
  hash: string;
  url: string;
  format: string;
  contentType: string;
  size: number;
  width?: number;
  height?: number;
  transformations: Record<string, unknown>;
  createdAt: Date;
}

export interface TransformImageResponse {
  imageId: string;
  cached: boolean;
  variant: TransformVariantResponse;
}

interface TransformedResult {
  buffer: Buffer;
  contentType: string;
  format: SupportedImageFormat;
  width?: number;
  height?: number;
}

const OUTPUT_FORMATS = new Set<SupportedImageFormat>(SUPPORTED_IMAGE_FORMATS);

@Injectable()
export class ImagesService {
  constructor(
    @InjectModel('image') private readonly imageModel: Model<Image>,
    private readonly imageStorage: ImageStorageService,
  ) {}

  async createUploadUrl(userId: string, dto: CreateUploadUrlDto) {
    this.ensureValidObjectId(userId, 'userId');

    if (!dto.contentType?.startsWith('image/')) {
      throw new BadRequestException('Only image content types are supported');
    }

    const fileFormat =
      this.extractFormatFromFileName(dto.fileName) ??
      this.mimeToFormat(dto.contentType);
    if (!fileFormat) {
      throw new BadRequestException('Unsupported source image format');
    }

    const key = `images/pending/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${this.toStorageExtension(fileFormat)}`;
    return this.imageStorage.createPresignedPutUrl(
      key,
      dto.contentType,
      dto.expiresInSeconds ?? 300,
    );
  }

  async finalizeUpload(userId: string, dto: FinalizeUploadDto) {
    this.ensureValidObjectId(userId, 'userId');

    const prefix = `images/pending/${userId}/`;
    if (!dto.key.startsWith(prefix)) {
      throw new BadRequestException('Invalid upload key for this user');
    }

    const object = await this.imageStorage.getObject(dto.key);
    const contentType = dto.contentType?.trim() || object.contentType;
    if (!contentType?.startsWith('image/')) {
      throw new BadRequestException('Uploaded object is not an image');
    }

    const metadata = await sharp(object.buffer).metadata();
    const normalizedFormat = this.normalizeFormat(
      metadata.format ??
        this.mimeToFormat(contentType) ??
        this.extractFormatFromFileName(dto.fileName) ??
        'jpeg',
    );

    if (!normalizedFormat) {
      throw new BadRequestException('Unsupported source image format');
    }

    const image = new this.imageModel({
      owner: new Types.ObjectId(userId),
      originalKey: dto.key,
      originalName: dto.fileName,
      contentType,
      format: normalizedFormat,
      size: object.contentLength || object.buffer.length,
      width: metadata.width,
      height: metadata.height,
      variants: [],
    });

    await image.save();
    return this.toImageResponse(image as unknown as ImageDocument);
  }

  async uploadImage(userId: string, file: Express.Multer.File) {
    this.ensureValidObjectId(userId, 'userId');

    if (!file?.buffer) {
      throw new BadRequestException('Image file is required');
    }
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Only image uploads are supported');
    }

    const metadata = await sharp(file.buffer).metadata();
    const normalizedFormat = this.normalizeFormat(
      metadata.format ?? this.mimeToFormat(file.mimetype) ?? 'jpeg',
    );
    if (!normalizedFormat) {
      throw new BadRequestException('Unsupported source image format');
    }

    const image = new this.imageModel({
      owner: new Types.ObjectId(userId),
      originalName: file.originalname ?? `image.${normalizedFormat}`,
      contentType: file.mimetype || this.formatToMime(normalizedFormat),
      format: normalizedFormat,
      size: file.size ?? file.buffer.length,
      width: metadata.width,
      height: metadata.height,
      variants: [],
    });

    const imageId = image._id.toString();
    const originalKey = this.buildOriginalKey(imageId, normalizedFormat);
    await this.imageStorage.uploadObject(originalKey, file.buffer, image.contentType);

    image.originalKey = originalKey;
    await image.save();

    return this.toImageResponse(image as unknown as ImageDocument);
  }

  async listImages(userId: string, page = 1, limit = 10) {
    this.ensureValidObjectId(userId, 'userId');
    const normalizedPage = Number(page) > 0 ? Number(page) : 1;
    const normalizedLimit =
      Number(limit) > 0 ? Math.min(Number(limit), 100) : 10;
    const skip = (normalizedPage - 1) * normalizedLimit;
    const owner = new Types.ObjectId(userId);

    const [items, total] = await Promise.all([
      this.imageModel
        .find({ owner })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(normalizedLimit),
      this.imageModel.countDocuments({ owner }),
    ]);

    return {
      items: items.map((item) =>
        this.toImageResponse(item as unknown as ImageDocument),
      ),
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total,
        totalPages: Math.max(Math.ceil(total / normalizedLimit), 1),
      },
    };
  }

  async deleteImage(userId: string, imageId: string) {
    const image = await this.findOwnedImage(userId, imageId);

    const keysToDelete = [
      image.originalKey,
      ...(image.variants ?? []).map((variant) => variant.key),
    ].filter((key) => !!key);

    await this.imageStorage.deleteObjects(keysToDelete);
    await this.imageModel.deleteOne({ _id: image._id });

    return {
      id: image._id.toString(),
      deleted: true,
      removedKeys: keysToDelete.length,
    };
  }

  async transformImage(
    userId: string,
    imageId: string,
    dto: TransformImageDto,
  ): Promise<BinaryImageResult> {
    const image = await this.findOwnedImage(userId, imageId);
    const transformations = dto.transformations;
    const normalizedImageId = image._id.toString();

    if (!transformations || Object.keys(transformations).length === 0) {
      throw new BadRequestException('At least one transformation is required');
    }

    const plainTransformations = this.toPlainTransformations(transformations);
    const variantHash = this.hashTransformations(plainTransformations);
    const existingVariant = image.variants?.find(
      (variant) => variant.hash === variantHash,
    );

    if (existingVariant) {
      const cached = await this.imageStorage.getObject(existingVariant.key);
      return {
        buffer: cached.buffer,
        contentType: existingVariant.contentType || cached.contentType,
        fileName: `${normalizedImageId}-${existingVariant.hash}.${this.toStorageExtension(existingVariant.format as SupportedImageFormat)}`,
      };
    }

    const source = await this.imageStorage.getObject(image.originalKey);
    const transformed = await this.applyTransformations(
      source.buffer,
      transformations,
      this.normalizeFormat(image.format) ?? 'jpeg',
    );

    return {
      buffer: transformed.buffer,
      contentType: transformed.contentType,
      fileName: `${normalizedImageId}-preview.${this.toStorageExtension(transformed.format)}`,
    };
  }

  async saveTransformedImage(
    userId: string,
    imageId: string,
    dto: TransformImageDto,
  ): Promise<TransformImageResponse> {
    const image = await this.findOwnedImage(userId, imageId);
    const transformations = dto.transformations;
    const normalizedImageId = image._id.toString();

    if (!transformations || Object.keys(transformations).length === 0) {
      throw new BadRequestException('At least one transformation is required');
    }

    const plainTransformations = this.toPlainTransformations(transformations);
    const variantHash = this.hashTransformations(plainTransformations);
    const existingVariant = image.variants?.find(
      (variant) => variant.hash === variantHash,
    );

    if (existingVariant) {
      return {
        imageId: normalizedImageId,
        cached: true,
        variant: this.toVariantResponse(
          normalizedImageId,
          existingVariant as ImageVariant,
        ),
      };
    }

    const source = await this.imageStorage.getObject(image.originalKey);
    const transformed = await this.applyTransformations(
      source.buffer,
      transformations,
      this.normalizeFormat(image.format) ?? 'jpeg',
    );

    const variantKey = this.buildVariantKey(
      normalizedImageId,
      variantHash,
      transformed.format,
    );
    await this.imageStorage.uploadObject(
      variantKey,
      transformed.buffer,
      transformed.contentType,
    );

    const createdVariant = {
      hash: variantHash,
      key: variantKey,
      contentType: transformed.contentType,
      format: transformed.format,
      size: transformed.buffer.length,
      width: transformed.width,
      height: transformed.height,
      transformations: plainTransformations,
      createdAt: new Date(),
    } as ImageVariant;

    image.variants = [...(image.variants ?? []), createdVariant];
    await image.save();

    return {
      imageId: normalizedImageId,
      cached: false,
      variant: this.toVariantResponse(normalizedImageId, createdVariant),
    };
  }

  async getImageBinary(
    userId: string,
    imageId: string,
    query: RetrieveImageQueryDto,
  ): Promise<BinaryImageResult> {
    const image = await this.findOwnedImage(userId, imageId);

    let key = image.originalKey;
    let contentType = image.contentType;
    let fileName = `${image._id.toString()}.${this.toStorageExtension((this.normalizeFormat(image.format) ?? 'jpeg') as SupportedImageFormat)}`;

    if (query.variant) {
      const variant = image.variants?.find(
        (item) => item.hash === query.variant,
      );
      if (!variant) {
        throw new NotFoundException('Transformed variant not found');
      }
      key = variant.key;
      contentType = variant.contentType;
      fileName = `${image._id.toString()}-${variant.hash}.${this.toStorageExtension(variant.format as SupportedImageFormat)}`;
    }

    const object = await this.imageStorage.getObject(key);
    let outputBuffer = object.buffer;
    let outputContentType = contentType || object.contentType;
    let outputFileName = fileName;

    if (query.format) {
      const outputFormat = this.ensureOutputFormat(query.format);
      const transformed = await this.applyOutputFormat(
        sharp(outputBuffer),
        outputFormat,
        80,
      ).toBuffer({
        resolveWithObject: true,
      });
      outputBuffer = transformed.data;
      outputContentType = this.formatToMime(
        this.normalizeFormat(transformed.info.format) ?? outputFormat,
      );
      outputFileName = `${image._id.toString()}.${this.toStorageExtension(outputFormat)}`;
    }

    return {
      buffer: outputBuffer,
      contentType: outputContentType,
      fileName: outputFileName,
    };
  }

  private async findOwnedImage(userId: string, imageId: string) {
    this.ensureValidObjectId(userId, 'userId');
    this.ensureValidObjectId(imageId, 'imageId');

    const image = await this.imageModel.findOne({
      _id: new Types.ObjectId(imageId),
      owner: new Types.ObjectId(userId),
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    return image as unknown as ImageDocument;
  }

  private async applyTransformations(
    inputBuffer: Buffer,
    transformations: TransformationsDto,
    fallbackFormat: SupportedImageFormat,
  ): Promise<TransformedResult> {
    let pipeline = sharp(inputBuffer, { failOn: 'none' });

    if (transformations.crop) {
      pipeline = pipeline.extract({
        left: transformations.crop.x,
        top: transformations.crop.y,
        width: transformations.crop.width,
        height: transformations.crop.height,
      });
    }

    if (transformations.resize) {
      pipeline = pipeline.resize({
        width: transformations.resize.width,
        height: transformations.resize.height,
        fit: transformations.resize.fit ?? 'cover',
      });
    }

    if (typeof transformations.rotate === 'number') {
      pipeline = pipeline.rotate(transformations.rotate);
    }

    if (transformations.flip) {
      pipeline = pipeline.flip();
    }

    if (transformations.mirror) {
      pipeline = pipeline.flop();
    }

    if (transformations.filters?.grayscale) {
      pipeline = pipeline.grayscale();
    }

    if (transformations.filters?.sepia) {
      pipeline = pipeline
        .modulate({ saturation: 0.5, brightness: 1.05 })
        .tint({ r: 112, g: 66, b: 20 });
    }

    const outputFormat = transformations.format
      ? this.ensureOutputFormat(transformations.format)
      : this.ensureOutputFormat(fallbackFormat);
    const quality = transformations.compress?.quality ?? 80;
    pipeline = this.applyOutputFormat(pipeline, outputFormat, quality);

    let { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

    if (transformations.watermark?.text) {
      const watermark = this.buildWatermarkSvg(
        transformations.watermark.text,
        transformations.watermark.fontSize ?? 28,
        transformations.watermark.opacity ?? 35,
        info.width,
        info.height,
      );

      const watermarked = await sharp(data)
        .composite([
          {
            input: Buffer.from(watermark),
            gravity: transformations.watermark.position ?? 'southeast',
          },
        ])
        .toBuffer({ resolveWithObject: true });

      data = watermarked.data;
      info = watermarked.info;
    }

    const finalFormat = this.normalizeFormat(info.format) ?? outputFormat;

    return {
      buffer: data,
      contentType: this.formatToMime(finalFormat),
      format: finalFormat,
      width: info.width,
      height: info.height,
    };
  }

  private applyOutputFormat(
    pipeline: Sharp,
    format: SupportedImageFormat,
    quality: number,
  ) {
    const normalizedQuality = Math.min(Math.max(quality, 1), 100);

    switch (format) {
      case 'jpg':
      case 'jpeg':
        return pipeline.jpeg({ quality: normalizedQuality, mozjpeg: true });
      case 'png':
        return pipeline.png({
          quality: normalizedQuality,
          compressionLevel: 9,
        });
      case 'webp':
        return pipeline.webp({ quality: normalizedQuality });
      case 'avif':
        return pipeline.avif({ quality: normalizedQuality });
      default:
        return pipeline.jpeg({ quality: normalizedQuality, mozjpeg: true });
    }
  }

  private buildOriginalKey(imageId: string, format: SupportedImageFormat) {
    return `images/original/${imageId}.${this.toStorageExtension(format)}`;
  }

  private buildVariantKey(
    imageId: string,
    hash: string,
    format: SupportedImageFormat,
  ) {
    return `images/variants/${imageId}/${hash}.${this.toStorageExtension(format)}`;
  }

  private toStorageExtension(format: SupportedImageFormat) {
    return format === 'jpg' ? 'jpeg' : format;
  }

  private formatToMime(format: SupportedImageFormat) {
    switch (format) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'avif':
        return 'image/avif';
      default:
        return 'application/octet-stream';
    }
  }

  private mimeToFormat(mimeType?: string): SupportedImageFormat | null {
    if (!mimeType) {
      return null;
    }

    const map: Record<string, SupportedImageFormat> = {
      'image/jpeg': 'jpeg',
      'image/jpg': 'jpeg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/avif': 'avif',
    };

    return map[mimeType.toLowerCase()] ?? null;
  }

  private extractFormatFromFileName(
    fileName?: string,
  ): SupportedImageFormat | null {
    if (!fileName || !fileName.includes('.')) {
      return null;
    }

    const extension = fileName.split('.').pop()?.toLowerCase();
    return this.normalizeFormat(extension);
  }

  private normalizeFormat(format?: string | null): SupportedImageFormat | null {
    if (!format) {
      return null;
    }

    const normalized = format.toLowerCase() as SupportedImageFormat;
    if (normalized === 'jpg') {
      return 'jpeg';
    }

    return OUTPUT_FORMATS.has(normalized) ? normalized : null;
  }

  private ensureOutputFormat(format: string) {
    const normalized = this.normalizeFormat(format);
    if (!normalized) {
      throw new BadRequestException('Unsupported output format');
    }
    return normalized;
  }

  private toPlainTransformations(transformations: TransformationsDto) {
    return JSON.parse(JSON.stringify(transformations)) as Record<string, unknown>;
  }

  private hashTransformations(transformations: Record<string, unknown>) {
    const stable = this.stableStringify(transformations);
    return createHash('sha256').update(stable).digest('hex').slice(0, 20);
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      return `{${keys
        .map(
          (key) =>
            `${JSON.stringify(key)}:${this.stableStringify(record[key])}`,
        )
        .join(',')}}`;
    }

    return JSON.stringify(value);
  }

  private buildWatermarkSvg(
    text: string,
    fontSize: number,
    opacity: number,
    imageWidth?: number,
    imageHeight?: number,
  ) {
    const safeImageWidth = Math.max(1, imageWidth ?? 1);
    const safeImageHeight = Math.max(1, imageHeight ?? 1);
    const dynamicFontSize = Math.min(
      fontSize,
      Math.max(8, Math.floor(safeImageHeight * 0.35)),
    );
    const estimatedTextWidth = Math.max(
      1,
      Math.ceil(text.length * dynamicFontSize * 0.65) + 20,
    );
    const svgWidth = Math.min(estimatedTextWidth, safeImageWidth);
    const svgHeight = Math.min(
      Math.max(dynamicFontSize + 16, 24),
      safeImageHeight,
    );
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}">
        <style>
          .w {
            fill: rgba(255, 255, 255, ${opacity / 100});
            font-size: ${dynamicFontSize}px;
            font-family: Arial, sans-serif;
            font-weight: 700;
          }
        </style>
        <text x="8" y="${Math.max(dynamicFontSize, 12)}" class="w">${escaped}</text>
      </svg>
    `;
  }

  private ensureValidObjectId(value: string, fieldName: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }
  }

  private toImageResponse(image: ImageDocument) {
    const doc = image.toObject ? image.toObject() : image;
    const imageId = doc._id.toString();

    return {
      id: imageId,
      original: {
        key: doc.originalKey,
        url: `/images/${imageId}`,
        originalName: doc.originalName,
        contentType: doc.contentType,
        format: doc.format,
        size: doc.size,
        width: doc.width,
        height: doc.height,
      },
      variants: (doc.variants ?? []).map((variant: ImageVariant) => ({
        ...this.toVariantResponse(imageId, variant),
      })),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private toVariantResponse(imageId: string, variant: ImageVariant) {
    return {
      hash: variant.hash,
      url: `/images/${imageId}?variant=${variant.hash}`,
      format: variant.format,
      contentType: variant.contentType,
      size: variant.size,
      width: variant.width,
      height: variant.height,
      transformations: variant.transformations,
      createdAt: variant.createdAt,
    };
  }
}
