import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Readable } from 'stream';

export interface S3ObjectResult {
  buffer: Buffer;
  contentType: string;
  contentLength: number;
}

@Injectable()
export class AwsService {
  private readonly bucketName: string;
  private readonly s3: S3Client;

  constructor() {
    this.bucketName = process.env.AWS_BUCKET_NAME ?? '';
    this.s3 = new S3Client({
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      region: process.env.AWS_REGION,
    });
  }

  async uploadObject(key: string, body: Buffer, contentType: string) {
    if (!key || !body) {
      throw new BadRequestException('key and body are required');
    }

    const config = {
      Key: key,
      Bucket: this.bucketName,
      Body: body,
      ContentType: contentType,
    };

    const uploadCommand = new PutObjectCommand(config);
    await this.s3.send(uploadCommand);
    return key;
  }

  async getObject(key: string): Promise<S3ObjectResult> {
    if (!key) {
      throw new BadRequestException('key is required');
    }

    const config = {
      Key: key,
      Bucket: this.bucketName,
    };

    const getCommand = new GetObjectCommand(config);
    const fileStream = await this.s3.send(getCommand);

    if (!(fileStream.Body instanceof Readable)) {
      throw new BadRequestException('Unsupported file stream');
    }

    const chunks: Buffer[] = [];
    for await (const chunk of fileStream.Body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const buffer = Buffer.concat(chunks);
    return {
      buffer,
      contentType: fileStream.ContentType ?? 'application/octet-stream',
      contentLength: Number(fileStream.ContentLength ?? buffer.length),
    };
  }

  async uploadImage(
    filePath: string,
    file: Buffer,
    contentType = 'application/octet-stream',
  ) {
    return this.uploadObject(filePath, file, contentType);
  }

  async getImageFileById(fileId: string) {
    const file = await this.getObject(fileId);
    return `data:${file.contentType};base64,${file.buffer.toString('base64')}`;
  }
}
