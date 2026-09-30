import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CashAccountType, CashDirection, CashTxnKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PageQueryDto } from '@/common/dto/pagination.dto';
import { MANUAL_KINDS } from '../domain/cash-math';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = { maxDecimalPlaces: 2 } as const;

// ─── accounts ───

export class CreateCashAccountDto {
  @ApiProperty({ example: 'dbbl', description: 'Stable code (lowercase, a-z0-9_-)' })
  @IsString()
  @Matches(/^[a-z0-9_-]{2,30}$/)
  code: string;

  @ApiProperty({ example: 'ডাচ-বাংলা ব্যাংক' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @ApiProperty({ enum: CashAccountType })
  @IsEnum(CashAccountType)
  type: CashAccountType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  accountNo?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONEY)
  openingBalance?: number;
}

export class UpdateCashAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  accountNo?: string;

  @ApiPropertyOptional({ description: 'Only while the account has no transactions' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONEY)
  openingBalance?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ─── queries ───

export class CashbookQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Dhaka day, inclusive' })
  @IsOptional()
  @Matches(ISO_DAY)
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Dhaka day, inclusive' })
  @IsOptional()
  @Matches(ISO_DAY)
  to?: string;

  @ApiPropertyOptional({ enum: CashTxnKind })
  @IsOptional()
  @IsEnum(CashTxnKind)
  kind?: CashTxnKind;

  @ApiPropertyOptional({ enum: CashDirection })
  @IsOptional()
  @IsEnum(CashDirection)
  direction?: CashDirection;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  orderId?: string;
}

export class DayCloseQueryDto {
  @ApiPropertyOptional({ example: '2026-09-29', description: 'Dhaka day (default today)' })
  @IsOptional()
  @Matches(ISO_DAY)
  date?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  accountId?: string;
}

export class DailyQueryDto {
  @ApiProperty({ example: '2026-09-01' })
  @Matches(ISO_DAY)
  from: string;

  @ApiProperty({ example: '2026-09-30' })
  @Matches(ISO_DAY)
  to: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  accountId?: string;
}

// ─── commands ───

class WhenDto {
  @ApiPropertyOptional({ description: 'ISO instant, or YYYY-MM-DD (= noon that day in Dhaka). Default now.' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  occurredAt?: string;
}

export class ManualEntryDto extends WhenDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  accountId: string;

  @ApiProperty({ enum: CashDirection })
  @IsEnum(CashDirection)
  direction: CashDirection;

  @ApiProperty({ enum: MANUAL_KINDS, default: 'MANUAL' })
  @IsIn(MANUAL_KINDS as unknown as string[])
  kind: CashTxnKind;

  @ApiProperty({ example: 350 })
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: 'প্যাকিং ম্যাটেরিয়াল' })
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  memo: string;

  @ApiPropertyOptional({ example: 'প্যাকিং', description: 'Required for EXPENSE' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  expenseCategory?: string;
}

export class TransferDto extends WhenDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  fromAccountId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  toAccountId: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: 'বিকাশ থেকে ব্যাংকে' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  memo?: string;
}

export class ReverseEntryDto extends WhenDto {
  @ApiProperty({ example: 'ভুল খাতে লেখা হয়েছিল' })
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  reason: string;
}

export class CourierPaymentDto extends WhenDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  orderId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  accountId: string;

  @ApiPropertyOptional({ description: 'Default: the order courier cost' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  memo?: string;
}

export class CodRemittanceDto extends WhenDto {
  @ApiProperty({ format: 'uuid', description: 'Account the courier paid into' })
  @IsUUID()
  accountId: string;

  @ApiProperty({ description: 'Money actually received from the courier' })
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ type: [String], description: 'Shipments this remittance settles (marked REMITTED)' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  shipmentIds?: string[];

  @ApiPropertyOptional({ example: 'পাঠাও সেটলমেন্ট #8812' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  memo?: string;
}
