import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsBoolean, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { Trim } from '../../shared/query-transforms';

export class UpdateSectionDto {
  @ApiPropertyOptional({ description: 'স্টোরফ্রন্টে দেখাবে কিনা (অন্তত একটি বিভাগ খোলা থাকতে হবে)' })
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @ApiPropertyOptional({ example: 'বই' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  nameBn?: string;

  @ApiPropertyOptional({ example: 'Books' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  nameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ example: 'কোন বই খুঁজছেন?' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  searchHint?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) heroKicker?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) heroTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) heroSub?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(600) heroLead?: string;

  @ApiPropertyOptional({ description: 'Remaining copy blocks (popular, how1, how1p…) — merged into the stored JSON', type: Object })
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;
}

export class CreateCategoryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sectionId: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'দিলে সাব-ক্যাটাগরি (সর্বোচ্চ ২ স্তর)' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiProperty({ example: 'নবম-দশম' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nameBn: string;

  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(120) nameEn?: string;

  @ApiPropertyOptional({ description: 'Auto from the name when omitted' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(110)
  @Matches(/^[\p{L}\p{M}\p{N}-]+$/u, { message: 'slug may contain letters, digits and hyphens only' })
  slug?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() imageId?: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isVisible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateCategoryDto extends PartialType(PickType(CreateCategoryDto, ['nameBn', 'nameEn', 'slug', 'description', 'imageId', 'isVisible', 'sortOrder'] as const)) {}

export class ReorderCategoriesDto {
  @ApiProperty({ type: [String], description: 'Sibling ids in the new order' })
  @IsUUID('all', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  ids: string[];
}

export class CategoryVisibilityDto {
  @ApiProperty()
  @IsBoolean()
  isVisible: boolean;

  @ApiPropertyOptional({ default: true, description: 'সাব-ক্যাটাগরিগুলোও একসাথে' })
  @IsOptional()
  @IsBoolean()
  includeSubcategories?: boolean;
}

/** নতুন বিভাগ — e.g. "স্টেশনারি" (code: stationery). */
export class CreateSectionDto {
  @ApiProperty({ example: 'stationery', description: 'স্থায়ী কোড (ইংরেজি ছোট হাতের অক্ষর, সংখ্যা, -) — URL ও অ্যাপে ব্যবহার হয়, পরে বদলানো যায় না' })
  @Trim()
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{1,29}$/, { message: 'কোড ইংরেজি ছোট হাতের অক্ষর দিয়ে শুরু করুন (a-z, 0-9, -), ২–৩০ অক্ষর' })
  code: string;

  @ApiProperty({ example: 'স্টেশনারি' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  nameBn: string;

  @ApiProperty({ example: 'Stationery' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  nameEn: string;

  @ApiPropertyOptional({ example: 'কোন খাতা-কলম খুঁজছেন?' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  searchHint?: string;

  @ApiPropertyOptional({ example: 'চলো স্টেশনারি' }) @IsOptional() @IsString() @MaxLength(120) heroKicker?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) heroTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) heroSub?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) heroLead?: string;

  @ApiPropertyOptional({ description: 'আইকন (emoji বা আইকন-কী) ও রঙ — content.icon / content.color এ থাকে', example: { icon: '✏️', color: '#2F5D8A' } })
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @ApiPropertyOptional({ default: false, description: 'শুরুতে লুকানো রেখে ক্যাটাগরি/পণ্য সাজিয়ে পরে চালু করুন' })
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}
