import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { imageSchema } from './schema/image.schema';
import { ImagesController } from './images.controller';
import { TransformRateLimitGuard } from './guards/transform-rate-limit.guard';
import { ImageStorageService } from './image-storage.service';
import { ImagesService } from './images.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'image', schema: imageSchema }])],
  controllers: [ImagesController],
  providers: [ImagesService, ImageStorageService, TransformRateLimitGuard],
  exports: [ImagesService],
})
export class ImagesModule {}
