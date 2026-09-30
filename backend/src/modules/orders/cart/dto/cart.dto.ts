import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export const CART_TOKEN_HEADER = 'x-cart-token';

export class AddCartItemDto {
  @ApiProperty({ enum: ['PRODUCT', 'BUNDLE'] })
  @IsIn(['PRODUCT', 'BUNDLE'])
  kind: 'PRODUCT' | 'BUNDLE';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  bundleId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 99 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  quantity?: number;
}

export class UpdateCartItemDto {
  @ApiProperty({ minimum: 0, maximum: 99, description: '0 removes the line' })
  @IsInt()
  @Min(0)
  @Max(99)
  quantity: number;
}

export class ApplyCouponDto {
  @ApiProperty({ example: 'CHOLO10' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code: string;
}

export class MergeCartDto {
  @ApiProperty({ description: 'The guest cart token kept by the browser before login' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{16,64}$/)
  guestToken: string;
}

export class CartQueryDto {
  @ApiPropertyOptional({ description: 'District id or name for the delivery fee in the quote' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  district?: string;
}

export class CartItemParam {
  @IsUUID()
  itemId: string;
}
