import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PageQueryDto } from '@/common/dto/pagination.dto';
import { MONEY_MAX } from './product-write.dto';

export const BULK_MAX = 500;

export class BulkIdsDto {
  @ApiProperty({ type: [String], maxItems: BULK_MAX })
  @IsUUID('all', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_MAX)
  @ArrayUnique()
  ids: string[];
}

export class BulkPriceDto extends BulkIdsDto {
  @ApiProperty({ minimum: 0.01, maximum: 90, example: 10 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(90)
  percent: number;

  @ApiProperty({ enum: ['up', 'down'] })
  @IsIn(['up', 'down'])
  direction: 'up' | 'down';
}

export class BulkDiscountDto extends BulkIdsDto {
  @ApiProperty({ minimum: 0, maximum: 95, description: '0 removes the struck price', example: 15 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(95)
  percent: number;
}

export class BulkRestockDto extends BulkIdsDto {
  @ApiProperty({ minimum: 1, example: 10 })
  @IsInt()
  @Min(1)
  @Max(100_000)
  units: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class BulkFreeShippingDto extends BulkIdsDto {
  @ApiProperty()
  @IsBoolean()
  freeShipping: boolean;
}

export class BulkMoveDto extends BulkIdsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subcategoryId?: string;
}

export class StockAdjustDto {
  @ApiProperty({ description: 'New absolute on-hand count (গণনা)', example: 12 })
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  onHand: number;

  @ApiProperty({ example: 'মাসিক গণনা — ২টি কম পাওয়া গেছে' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string;

  @ApiPropertyOptional({ enum: ['ADJUSTMENT', 'DAMAGE', 'WRITE_OFF'], default: 'ADJUSTMENT' })
  @IsOptional()
  @IsIn(['ADJUSTMENT', 'DAMAGE', 'WRITE_OFF'])
  type?: 'ADJUSTMENT' | 'DAMAGE' | 'WRITE_OFF';
}

export class StockMovementsQueryDto extends PageQueryDto {}

export class CreateDealDto {
  @ApiProperty({ description: 'ছাড়ের দাম — must be below the regular price', example: 299 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(MONEY_MAX)
  dealPrice: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'default: now' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  endsAt: Date;

  @ApiPropertyOptional({ example: 'ঈদ অফার' }) @IsOptional() @IsString() @MaxLength(60) label?: string;

  @ApiPropertyOptional({ default: false, description: 'Cancel overlapping live/scheduled deals instead of failing with 409' })
  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;
}

export class DealsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['active', 'ending_soon', 'scheduled'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'ending_soon', 'scheduled'])
  state: 'active' | 'ending_soon' | 'scheduled' = 'active';

  @ApiPropertyOptional({ default: 24, description: 'ending_soon window (hours)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24 * 30)
  withinHours = 24;

  @ApiPropertyOptional({ description: 'Section code or id' }) @IsOptional() @IsString() @MaxLength(120) section?: string;
}

export class AttachImageDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  mediaId: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class ReorderImagesDto {
  @ApiProperty({ type: [String], description: 'Media ids in display order' })
  @IsUUID('all', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  mediaIds: string[];
}
