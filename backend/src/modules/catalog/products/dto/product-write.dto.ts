import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { ContentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../shared/query-transforms';

export const MONEY_MAX = 9_999_999_999;
const money = { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false } as const;

export class ProductAuthorRefDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  authorId: string;

  @ApiPropertyOptional({ enum: ['author', 'editor', 'translator'], default: 'author' })
  @IsOptional()
  @IsIn(['author', 'editor', 'translator'])
  role?: string;
}

export class SetProductAuthorsDto {
  @ApiProperty({ type: [ProductAuthorRefDto] })
  @ValidateNested({ each: true })
  @Type(() => ProductAuthorRefDto)
  @ArrayMaxSize(20)
  authors: ProductAuthorRefDto[];
}

export class CreateProductDto {
  @ApiProperty({ format: 'uuid', description: 'Main category (its section becomes the product section)' })
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  subcategoryId?: string | null;

  @ApiProperty({ example: 'নবম-দশম পদার্থবিজ্ঞান গাইড' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  title: string;

  @ApiPropertyOptional({ description: 'Author / unit line under the title' }) @IsOptional() @Trim() @IsString() @MaxLength(240) subtitle?: string | null;
  @ApiPropertyOptional({ example: '১ লিটার' }) @IsOptional() @Trim() @IsString() @MaxLength(60) unit?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20000) description?: string | null;

  @ApiPropertyOptional({ example: '#7A2430' })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{3,8}$/)
  coverColor?: string | null;

  @ApiPropertyOptional({ description: 'Auto-generated when omitted' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(60)
  @Matches(/^[A-Za-z0-9._-]+$/)
  sku?: string;

  @ApiPropertyOptional({ description: 'Auto from the title when omitted' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  @Matches(/^[\p{L}\p{M}\p{N}-]+$/u)
  slug?: string;

  @ApiPropertyOptional({ enum: ContentStatus, default: 'ACTIVE' }) @IsOptional() @IsEnum(ContentStatus) status?: ContentStatus;

  // book / physical specifics
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(20) isbn?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100000) pages?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) edition?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) language?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1_000_000) weightGrams?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(600) warrantyMonths?: number | null;
  @ApiPropertyOptional({ type: Object, description: 'Free-form spec sheet' }) @IsOptional() @IsObject() attributes?: Record<string, unknown>;

  // pricing
  @ApiProperty({ description: 'নতুন দাম (regular selling price)', example: 350 })
  @IsNumber(money)
  @Min(0)
  @Max(MONEY_MAX)
  price: number;

  @ApiPropertyOptional({ description: 'পুরনো দাম (struck price) — must be above price', nullable: true })
  @IsOptional()
  @IsNumber(money)
  @Min(0)
  @Max(MONEY_MAX)
  compareAtPrice?: number | null;

  @ApiPropertyOptional({ description: 'কেনা দাম — null keeps profit unknown', nullable: true })
  @IsOptional()
  @IsNumber(money)
  @Min(0)
  @Max(MONEY_MAX)
  costPrice?: number | null;

  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) taxRate?: number;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() freeShipping?: boolean;

  // inventory
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() trackInventory?: boolean;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() allowBackorder?: boolean;
  @ApiPropertyOptional({ nullable: true, description: 'null → store default (5)' }) @IsOptional() @IsInt() @Min(0) @Max(9999) lowStockThreshold?: number | null;

  @ApiPropertyOptional({ description: 'আসল কপি — opening stock (ledger OPENING movement)', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  initialCopies?: number;

  // relations
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) @IsOptional() @IsUUID() publisherId?: string | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) @IsOptional() @IsUUID() brandId?: string | null;

  @ApiPropertyOptional({ type: [ProductAuthorRefDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProductAuthorRefDto)
  @ArrayMaxSize(20)
  authors?: ProductAuthorRefDto[];

  @ApiPropertyOptional({ type: [String], description: 'Uploaded media ids; the first becomes the cover' })
  @IsOptional()
  @IsUUID('all', { each: true })
  @ArrayUnique()
  @ArrayMaxSize(20)
  imageIds?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) seoTitle?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(400) seoDescription?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  publishedAt?: Date | null;
}

export class UpdateProductDto extends PartialType(OmitType(CreateProductDto, ['initialCopies', 'imageIds'] as const)) {
  @ApiProperty({ description: 'Optimistic lock: the `version` you loaded. 409 product.version_conflict when stale.' })
  @IsInt()
  @Min(0)
  version: number;

  @ApiPropertyOptional({ description: 'Why the price changed (price history)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  priceReason?: string;
}
