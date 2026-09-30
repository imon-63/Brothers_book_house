import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ContentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { PageQueryDto } from '@/common/dto/pagination.dto';
import { ToBool, Trim } from '../../shared/query-transforms';
import { MONEY_MAX } from '../../products/dto/product-write.dto';

export class BundleItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  quantity?: number;
}

export class CreateBundleDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sectionId: string;

  @ApiProperty({ example: 'এসএসসি প্যাকেজ' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  @Matches(/^[\p{L}\p{M}\p{N}-]+$/u)
  slug?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string | null;

  @ApiProperty({ example: 1200 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MONEY_MAX)
  price: number;

  @ApiPropertyOptional({ nullable: true, description: 'null → Σ regular item prices at read time' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MONEY_MAX)
  compareAtPrice?: number | null;

  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() freeShipping?: boolean;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) @IsOptional() @IsUUID() coverId?: string | null;
  @ApiPropertyOptional({ enum: ContentStatus, default: 'ACTIVE' }) @IsOptional() @IsEnum(ContentStatus) status?: ContentStatus;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;

  @ApiProperty({ type: [BundleItemDto], minItems: 2 })
  @ValidateNested({ each: true })
  @Type(() => BundleItemDto)
  @ArrayMinSize(2)
  @ArrayMaxSize(50)
  items: BundleItemDto[];
}

export class UpdateBundleDto extends PartialType(CreateBundleDto) {}

export class PublicBundleQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Section code or id' }) @IsOptional() @Trim() @IsString() @MaxLength(120) section?: string;
}

export class AdminBundleQueryDto extends PublicBundleQueryDto {
  @ApiPropertyOptional({ enum: ContentStatus }) @IsOptional() @IsEnum(ContentStatus) status?: ContentStatus;
  @ApiPropertyOptional() @IsOptional() @ToBool() @IsBoolean() deleted?: boolean;
}
