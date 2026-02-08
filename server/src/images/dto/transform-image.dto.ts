import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export const SUPPORTED_IMAGE_FORMATS = [
  'jpeg',
  'jpg',
  'png',
  'webp',
  'avif',
] as const;
export type SupportedImageFormat = (typeof SUPPORTED_IMAGE_FORMATS)[number];

class ResizeDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  width: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  height: number;

  @IsOptional()
  @IsIn(['cover', 'contain', 'fill', 'inside', 'outside'])
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
}

class CropDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  width: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  height: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  x: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  y: number;
}

class WatermarkDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @IsIn([
    'northwest',
    'north',
    'northeast',
    'west',
    'center',
    'east',
    'southwest',
    'south',
    'southeast',
  ])
  position?:
    | 'northwest'
    | 'north'
    | 'northeast'
    | 'west'
    | 'center'
    | 'east'
    | 'southwest'
    | 'south'
    | 'southeast';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(12)
  @Max(96)
  fontSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(100)
  opacity?: number;
}

class CompressDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quality: number;
}

class FiltersDto {
  @IsOptional()
  @IsBoolean()
  grayscale?: boolean;

  @IsOptional()
  @IsBoolean()
  sepia?: boolean;
}

export class TransformationsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ResizeDto)
  resize?: ResizeDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CropDto)
  crop?: CropDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  rotate?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => WatermarkDto)
  watermark?: WatermarkDto;

  @IsOptional()
  @IsBoolean()
  flip?: boolean;

  @IsOptional()
  @IsBoolean()
  mirror?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompressDto)
  compress?: CompressDto;

  @IsOptional()
  @IsIn(SUPPORTED_IMAGE_FORMATS)
  format?: SupportedImageFormat;

  @IsOptional()
  @ValidateNested()
  @Type(() => FiltersDto)
  filters?: FiltersDto;
}

export class TransformImageDto {
  @IsObject()
  @ValidateNested()
  @Type(() => TransformationsDto)
  transformations: TransformationsDto;
}
