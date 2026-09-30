import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SettlementStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
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
import { PageQueryDto } from '@/common/dto/pagination.dto';

const MONEY = { maxDecimalPlaces: 2 } as const;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export class CreateSupplierDto {
  @ApiProperty({ example: 'পাঞ্জেরী পাবলিকেশন্স' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ example: '01711111111' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdateSupplierDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class PurchaseLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  quantity: number;

  @ApiProperty({ example: 180, description: 'কেনা দাম per unit' })
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0.01)
  unitCost: number;
}

export class PayNowDto {
  @ApiProperty({ format: 'uuid', description: 'কোন খাত থেকে' })
  @IsUUID()
  accountId: string;

  @ApiPropertyOptional({ description: 'Default: the full bill' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0.01)
  amount?: number;
}

export class CreatePurchaseDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  supplierId: string;

  @ApiPropertyOptional({ example: '2026-09-29', description: 'Dhaka day or ISO instant; default now' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  purchasedAt?: string;

  @ApiProperty({ type: [PurchaseLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines: PurchaseLineDto[];

  @ApiPropertyOptional({ default: 0, description: 'Carriage / other charges on the bill (not added to unit cost)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0)
  otherCharges?: number;

  @ApiPropertyOptional({ description: 'সাপ্লায়ারের চালান নম্বর' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  invoiceRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ type: PayNowDto, description: 'এখনই পরিশোধ — omit to leave the supplier due' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PayNowDto)
  payment?: PayNowDto;
}

export class PurchasePaymentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  accountId: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  occurredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  memo?: string;
}

export class PurchaseQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ enum: SettlementStatus })
  @IsOptional()
  @IsEnum(SettlementStatus)
  paymentStatus?: SettlementStatus;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @Matches(ISO_DAY)
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @Matches(ISO_DAY)
  to?: string;
}
