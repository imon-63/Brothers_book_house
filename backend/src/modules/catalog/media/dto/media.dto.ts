import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '@/common/dto/pagination.dto';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

export class UploadMediaDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'JPEG / PNG / WebP / GIF, ≤ 5 MB' })
  @IsOptional() // the binary part is taken by FileInterceptor; this only whitelists the field name
  file?: unknown;

  @ApiPropertyOptional({ description: 'Alt text (accessibility / SEO)' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  alt?: string;
}

export class MediaQueryDto extends PageQueryDto {}
