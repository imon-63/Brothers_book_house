import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { CouponScope, CouponType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '@/common/dto/pagination.dto';

export class CouponTargetDto {
  @ApiPropertyOptional({ example: 'book' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  sectionCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  bundleId?: string;
}

export class CreateCouponDto {
  @ApiProperty({ example: 'EID20', description: 'Stored upper-case, matched case-insensitively' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9_-]{3,24}$/, { message: 'কোডে শুধু ইংরেজি অক্ষর/সংখ্যা (৩–২৪)' })
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string | null;

  @ApiProperty({ enum: CouponType })
  @IsEnum(CouponType)
  type: CouponType;

  @ApiProperty({ description: '% for PERCENT, ৳ for FIXED, 0 for FREE_SHIPPING' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value: number;

  @ApiPropertyOptional({ description: 'Cap for PERCENT (৳)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  maxDiscount?: number | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minSubtotal?: number;

  @ApiPropertyOptional({ enum: CouponScope, default: 'ALL' })
  @IsOptional()
  @IsEnum(CouponScope)
  scope?: CouponScope;

  @ApiPropertyOptional({ type: [CouponTargetDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CouponTargetDto)
  targets?: CouponTargetDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  perCustomerLimit?: number | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  firstOrderOnly?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  showInHeader?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string | null;
}

export class UpdateCouponDto extends PartialType(OmitType(CreateCouponDto, ['targets'] as const)) {}

export class ReplaceTargetsDto {
  @ApiProperty({ enum: CouponScope })
  @IsEnum(CouponScope)
  scope: CouponScope;

  @ApiProperty({ type: [CouponTargetDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CouponTargetDto)
  targets: CouponTargetDto[];
}

export class CouponListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['all', 'active', 'inactive', 'expired'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'active', 'inactive', 'expired'])
  state: 'all' | 'active' | 'inactive' | 'expired' = 'all';
}
