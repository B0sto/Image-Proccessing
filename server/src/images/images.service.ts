import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Express } from 'express';
import { Model, Types } from 'mongoose';
import sharp, { Sharp } from 'sharp';
import { createHash } from 'crypto';
import { AwsService } from '../aws/aws.service';
import { RetrieveImageQueryDto } from './dto/retrieve-image-query.dto';
import {
  SUPPORTED_IMAGE_FORMATS,
  SupportedImageFormat,
  TransformImageDto,
  TransformationsDto,
} from './dto/transform-image.dto';
import { Image, ImageDocument, ImageVariant } from './schema/image.schema';

interface BinaryImageResult {
  buffer: Buffer;
  contentType: string;
  fileName: string;
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
    private readonly awsService: AwsService,
  ) {}

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
    const originalKey = this.buildOriginalKey(
      userId,
      imageId,
      normalizedFormat,
    );
    await this.awsService.uploadObject(
      originalKey,
      file.buffer,
      image.contentType,
    );

    image.originalKey = originalKey;
    await image.save();

    return this.toImageResponse(image);
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

  async transformImage(
    userId: string,
    imageId: string,
    dto: TransformImageDto,
  ) {
    const image = await this.findOwnedImage(userId, imageId);
    const transformations = dto.transformations;

    if (!transformations || Object.keys(transformations).length === 0) {
      throw new BadRequestException('At least one transformation is required');
    }

    const transformHash = this.hashTransformations(transformations);
    const existingVariant = image.variants?.find(
      (variant) => variant.hash === transformHash,
    );

    if (existingVariant) {
      return this.toVariantResponse(
        image._id.toString(),
        existingVariant,
        true,
      );
    }

    const source = await this.awsService.getObject(image.originalKey);
    const transformed = await this.applyTransformations(
      source.buffer,
      transformations,
      this.normalizeFormat(image.format) ?? 'jpeg',
    );

    const variantKey = this.buildVariantKey(
      userId,
      image._id.toString(),
      transformHash,
      transformed.format,
    );
    await this.awsService.uploadObject(
      variantKey,
      transformed.buffer,
      transformed.contentType,
    );

    const variant: ImageVariant = {
      hash: transformHash,
      key: variantKey,
      contentType: transformed.contentType,
      format: transformed.format,
      size: transformed.buffer.length,
      width: transformed.width,
      height: transformed.height,
      transformations: transformations as unknown as Record<string, unknown>,
      createdAt: new Date(),
    };

    image.variants.push(variant);
    await image.save();

    return this.toVariantResponse(image._id.toString(), variant, false);
  }

  async getImageBinary(
    userId: string,
    imageId: string,
    query: RetrieveImageQueryDto,
  ): Promise<BinaryImageResult> {
    const image = await this.findOwnedImage(userId, imageId);

    let key = image.originalKey;
    let contentType = image.contentType;
    let fileName = `${image._id.toString()}.${this.normalizeFormat(image.format) ?? 'jpeg'}`;

    if (query.variant) {
      const variant = image.variants?.find(
        (item) => item.hash === query.variant,
      );
      if (!variant) {
        throw new NotFoundException('Transformed variant not found');
      }
      key = variant.key;
      contentType = variant.contentType;
      fileName = `${image._id.toString()}-${variant.hash}.${variant.format}`;
    }

    const object = await this.awsService.getObject(key);
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
      outputFileName = `${image._id.toString()}.${outputFormat}`;
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

  private hashTransformations(transformations: TransformationsDto) {
    const normalized = this.sortObjectKeys(transformations);
    return createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex')
      .slice(0, 24);
  }

  private sortObjectKeys(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortObjectKeys(item));
    }

    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      return Object.keys(obj)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          if (obj[key] !== undefined) {
            acc[key] = this.sortObjectKeys(obj[key]);
          }
          return acc;
        }, {});
    }

    return value;
  }

  private buildOriginalKey(
    userId: string,
    imageId: string,
    format: SupportedImageFormat,
  ) {
    return `users/${userId}/images/${imageId}/original.${format === 'jpg' ? 'jpeg' : format}`;
  }

  private buildVariantKey(
    userId: string,
    imageId: string,
    hash: string,
    format: SupportedImageFormat,
  ) {
    return `users/${userId}/images/${imageId}/variants/${hash}.${format === 'jpg' ? 'jpeg' : format}`;
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

    return map[mimeType] ?? null;
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

  private buildWatermarkSvg(
    text: string,
    fontSize: number,
    opacity: number,
    imageWidth?: number,
    imageHeight?: number,
  ) {
    const safeImageWidth = Math.max(1, imageWidth ?? 1);
    const safeImageHeight = Math.max(1, imageHeight ?? 1);
    const dynamicFontSize = Math.min(fontSize, Math.max(8, Math.floor(safeImageHeight * 0.35)));
    const estimatedTextWidth = Math.max(1, Math.ceil(text.length * dynamicFontSize * 0.65) + 20);
    const svgWidth = Math.min(estimatedTextWidth, safeImageWidth);
    const svgHeight = Math.min(Math.max(dynamicFontSize + 16, 24), safeImageHeight);
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
        hash: variant.hash,
        url: `/images/${imageId}?variant=${variant.hash}`,
        format: variant.format,
        contentType: variant.contentType,
        size: variant.size,
        width: variant.width,
        height: variant.height,
        transformations: variant.transformations,
        createdAt: variant.createdAt,
      })),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private toVariantResponse(
    imageId: string,
    variant: ImageVariant,
    cached: boolean,
  ) {
    return {
      imageId,
      cached,
      variant: {
        hash: variant.hash,
        key: variant.key,
        url: `/images/${imageId}?variant=${variant.hash}`,
        format: variant.format,
        contentType: variant.contentType,
        size: variant.size,
        width: variant.width,
        height: variant.height,
        transformations: variant.transformations,
        createdAt: variant.createdAt,
      },
    };
  }
}
