import { ApiPropertyOptional } from '@nestjs/swagger';
import { ContentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PageQueryDto } from '@/common/dto/pagination.dto';
import { ToBool, Trim } from '../../shared/query-transforms';

export const PUBLIC_SORTS = ['relevance', 'popular', 'new', 'price_asc', 'price_desc', 'rating'] as const;
export type PublicSort = (typeof PUBLIC_SORTS)[number];

export class PublicProductQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Section code (book|food|gadget) or id', example: 'book' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  section?: string;

  @ApiPropertyOptional({ description: 'Category slug or id' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({ description: 'Sub-category slug or id' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  subcategory?: string;

  @ApiPropertyOptional({ description: 'Author slug or id' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(160)
  author?: string;

  @ApiPropertyOptional() @IsOptional() @ToBool() @IsBoolean() inStock?: boolean;
  @ApiPropertyOptional() @IsOptional() @ToBool() @IsBoolean() onDeal?: boolean;
  @ApiPropertyOptional() @IsOptional() @ToBool() @IsBoolean() freeShipping?: boolean;

  @ApiPropertyOptional({ description: 'Min effective price (৳)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Max effective price (৳)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ enum: PUBLIC_SORTS, description: 'default: relevance when q is set, else popular' })
  @IsOptional()
  @IsIn(PUBLIC_SORTS)
  sort?: PublicSort;
}

export const ADMIN_SORTS = ['name', 'price', 'stock', 'sold', 'margin', 'new'] as const;
export const ADMIN_QUICK = ['all', 'low', 'out', 'deal', 'nocost', 'free', 'hidden'] as const;

export class AdminProductQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Section code or id' }) @IsOptional() @Trim() @IsString() @MaxLength(120) section?: string;
  @ApiPropertyOptional({ description: 'Category slug or id' }) @IsOptional() @Trim() @IsString() @MaxLength(120) category?: string;
  @ApiPropertyOptional({ description: 'Sub-category slug or id' }) @IsOptional() @Trim() @IsString() @MaxLength(120) subcategory?: string;

  @ApiPropertyOptional({ enum: ADMIN_QUICK, default: 'all' })
  @IsOptional()
  @IsIn(ADMIN_QUICK)
  quick?: (typeof ADMIN_QUICK)[number];

  @ApiPropertyOptional({ description: 'Low-stock threshold override (admin preference); default per product ?? 5' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  lowStock?: number;

  @ApiPropertyOptional({ enum: ContentStatus }) @IsOptional() @IsEnum(ContentStatus) status?: ContentStatus;
  @ApiPropertyOptional({ description: 'true → the trash (soft-deleted) for restore' }) @IsOptional() @ToBool() @IsBoolean() deleted?: boolean;
  @ApiPropertyOptional() @IsOptional() @ToBool() @IsBoolean() freeShipping?: boolean;

  @ApiPropertyOptional({ enum: ADMIN_SORTS, default: 'new' })
  @IsOptional()
  @IsIn(ADMIN_SORTS)
  sort?: (typeof ADMIN_SORTS)[number];
}

export class SuggestQueryDto {
  @ApiPropertyOptional({ example: 'পদার্থ' })
  @Trim()
  @IsString()
  @MaxLength(120)
  q: string;

  @ApiPropertyOptional({ description: 'Section code or id to scope the suggestions' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  section?: string;

  @ApiPropertyOptional({ default: 7, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 7;
}
