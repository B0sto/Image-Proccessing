import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Readable } from 'stream';

export interface StoredObject {
  buffer: Buffer;
  contentType: string;
  contentLength: number;
}

@Injectable()
export class ImageStorageService {
  private readonly bucketName: string;
  private readonly s3: S3Client;

  constructor() {
    this.bucketName = process.env.AWS_BUCKET_NAME ?? '';

    const accessKeyId = process.env.AWS_ACCESS_KEY;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const credentials =
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined;

    this.s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials,
    });
  }

  async uploadObject(key: string, body: Buffer, contentType: string) {
    if (!key || !body) {
      throw new BadRequestException('key and body are required');
    }

    this.ensureConfigured();

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async getObject(key: string): Promise<StoredObject> {
    if (!key) {
      throw new BadRequestException('key is required');
    }

    this.ensureConfigured();

    const object = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );

    if (!(object.Body instanceof Readable)) {
      throw new InternalServerErrorException('Unsupported object body stream');
    }

    const chunks: Buffer[] = [];
    for await (const chunk of object.Body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const buffer = Buffer.concat(chunks);
    return {
      buffer,
      contentType: object.ContentType ?? 'application/octet-stream',
      contentLength: Number(object.ContentLength ?? buffer.length),
    };
  }

  async deleteObject(key: string) {
    if (!key) {
      return;
    }

    this.ensureConfigured();

    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );
  }

  async deleteObjects(keys: string[]) {
    if (!Array.isArray(keys) || keys.length === 0) {
      return;
    }

    await Promise.all(keys.filter((key) => !!key).map((key) => this.deleteObject(key)));
  }

  async createPresignedPutUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ) {
    if (!key || !contentType) {
      throw new BadRequestException('key and contentType are required');
    }

    this.ensureConfigured();

    const expiresIn = Math.max(30, Math.min(expiresInSeconds, 900));
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn });

    return {
      key,
      uploadUrl,
      expiresIn,
      method: 'PUT' as const,
      headers: {
        'Content-Type': contentType,
      },
    };
  }

  private ensureConfigured() {
    if (!this.bucketName) {
      throw new InternalServerErrorException('AWS_BUCKET_NAME is not configured');
    }
  }
}
