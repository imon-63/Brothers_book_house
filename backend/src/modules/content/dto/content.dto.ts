import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Allow, ArrayMaxSize, IsArray, IsBoolean, IsDate, IsInt, IsObject, IsOptional, IsString, IsUrl, IsUUID, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

const urlOpts = { require_protocol: false, require_tld: false } as const;

class Schedule {
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Date)
  @IsDate()
  startsAt?: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Date)
  @IsDate()
  endsAt?: Date | null;
}

export class CreateAnnouncementDto extends Schedule {
  @ApiProperty({ example: '৳৫০০+ অর্ডারে ফ্রি ডেলিভারি' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  text!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUrl(urlOpts)
  @MaxLength(500)
  linkUrl?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
export class UpdateAnnouncementDto extends PartialType(CreateAnnouncementDto) {}

export class ReorderDto {
  @ApiProperty({ type: [String], description: 'All ids in the new order' })
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  ids!: string[];
}

export class ReorderSlidesDto extends ReorderDto {
  @ApiProperty()
  @IsUUID()
  sectionId!: string;
}

export class CreatePromoDto extends Schedule {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  body?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Coupon whose code the popup shows' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  couponId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  imageId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  ctaLabel?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUrl(urlOpts)
  @MaxLength(500)
  ctaUrl?: string | null;

  @ApiPropertyOptional({ default: false, description: 'Activating deactivates every other popup' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
export class UpdatePromoDto extends PartialType(CreatePromoDto) {}

export class CreateHeroSlideDto extends Schedule {
  @ApiProperty()
  @IsUUID()
  sectionId!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(60) kicker?: string | null;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(200) subtitle?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  imageId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  imageUrl?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
export class UpdateHeroSlideDto extends PartialType(CreateHeroSlideDto) {}

export class SetSettingDto {
  @ApiProperty({ description: 'JSON value validated against the key schema' })
  @Allow()
  value!: unknown;
}

export class SetSettingsDto {
  @ApiProperty({ type: Object, example: { helpline: '01711111111', gateway_fee_pct: 2.5 } })
  @IsObject()
  values!: Record<string, unknown>;
}
