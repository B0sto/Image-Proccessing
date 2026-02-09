import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class FinalizeUploadDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsOptional()
  @IsString()
  contentType?: string;
}
