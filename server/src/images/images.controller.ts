import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { FinalizeUploadDto } from './dto/finalize-upload.dto';
import { ListImagesQueryDto } from './dto/list-images-query.dto';
import { RetrieveImageQueryDto } from './dto/retrieve-image-query.dto';
import { TransformImageDto } from './dto/transform-image.dto';
import { TransformRateLimitGuard } from './guards/transform-rate-limit.guard';
import { ImagesService } from './images.service';

@Controller('images')
@UseGuards(AuthGuard)
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post('upload-url')
  createUploadUrl(@Req() req, @Body() dto: CreateUploadUrlDto) {
    return this.imagesService.createUploadUrl(req.userId, dto);
  }

  @Post('finalize-upload')
  finalizeUpload(@Req() req, @Body() dto: FinalizeUploadDto) {
    return this.imagesService.finalizeUpload(req.userId, dto);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(@Req() req, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    return this.imagesService.uploadImage(req.userId, file);
  }

  @Post(':id/transform')
  @UseGuards(TransformRateLimitGuard)
  async transformImage(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: TransformImageDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.imagesService.transformImage(req.userId, id, dto);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${file.fileName}"`);
    return new StreamableFile(file.buffer);
  }

  @Post(':id/transform/save')
  @UseGuards(TransformRateLimitGuard)
  saveTransformedImage(@Req() req, @Param('id') id: string, @Body() dto: TransformImageDto) {
    return this.imagesService.saveTransformedImage(req.userId, id, dto);
  }

  @Get()
  listImages(@Req() req, @Query() query: ListImagesQueryDto) {
    return this.imagesService.listImages(req.userId, query.page, query.limit);
  }

  @Delete(':id')
  deleteImage(@Req() req, @Param('id') id: string) {
    return this.imagesService.deleteImage(req.userId, id);
  }

  @Get(':id')
  async retrieveImage(
    @Req() req,
    @Param('id') id: string,
    @Query() query: RetrieveImageQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.imagesService.getImageBinary(req.userId, id, query);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${file.fileName}"`);
    return new StreamableFile(file.buffer);
  }
}
