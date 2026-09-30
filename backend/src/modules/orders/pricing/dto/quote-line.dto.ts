import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class QuoteLineDto {
  @ApiProperty({ enum: ['PRODUCT', 'BUNDLE'] })
  @IsIn(['PRODUCT', 'BUNDLE'])
  kind: 'PRODUCT' | 'BUNDLE';

  @ApiPropertyOptional({ description: 'Required for PRODUCT' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'Required for BUNDLE' })
  @IsOptional()
  @IsUUID()
  bundleId?: string;

  @ApiProperty({ minimum: 1, maximum: 99 })
  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number;
}

/** Shared body for quote / coupon validation. */
export class CartLinesDto {
  @ApiProperty({ type: [QuoteLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  lines: QuoteLineDto[];

  @ApiPropertyOptional({ example: 'CHOLO10' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  couponCode?: string;

  @ApiPropertyOptional({ description: 'District id' })
  @IsOptional()
  @IsInt()
  @Min(1)
  districtId?: number;

  @ApiPropertyOptional({ description: 'District name (বাংলা/English), e.g. "ঢাকা"' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  district?: string;

  @ApiPropertyOptional({ description: 'Customer phone — lets per-customer coupon limits be checked early' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
