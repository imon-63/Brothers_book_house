import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { ReviewStatus } from '@prisma/client';
import { PageQueryDto } from '@/common/dto/pagination.dto';

const toBool = ({ value }: { value: unknown }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value);

export const REVIEW_SORTS = ['recent', 'helpful', 'rating_high', 'rating_low'] as const;

export class PublicReviewQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: REVIEW_SORTS, default: 'recent' })
  @IsOptional()
  @IsIn(REVIEW_SORTS)
  sort: (typeof REVIEW_SORTS)[number] = 'recent';

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ description: 'Only verified purchases' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  verified?: boolean;
}

export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(3000)
  body?: string;

  @ApiPropertyOptional({ description: 'Name shown publicly (default: first name + initial)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;
}

export class AdminReviewQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'APPROVED', 'REJECTED'] })
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED'])
  status?: ReviewStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  verified?: boolean;
}

export class RejectReviewDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ReplyReviewDto {
  @ApiProperty({ description: 'Empty string removes the reply' })
  @IsString()
  @MaxLength(2000)
  reply!: string;
}
