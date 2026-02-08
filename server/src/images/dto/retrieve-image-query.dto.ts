import { IsIn, IsOptional, IsString } from 'class-validator';
import { SUPPORTED_IMAGE_FORMATS } from './transform-image.dto';

export class RetrieveImageQueryDto {
  @IsOptional()
  @IsString()
  variant?: string;

  @IsOptional()
  @IsIn(SUPPORTED_IMAGE_FORMATS)
  format?: (typeof SUPPORTED_IMAGE_FORMATS)[number];
}
