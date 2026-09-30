import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderPriority, OrderStatus, PaymentMethod } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, ValidateNested, MinLength,
} from 'class-validator';
import { PageQueryDto } from '@/common/dto/pagination.dto';
import type { DateRange, StatusTab } from '../domain/order-filters';

export class OrderFilterDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['all', 'pending', 'run', 'done', 'cancel'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'pending', 'run', 'done', 'cancel'])
  tab: StatusTab = 'all';

  @ApiPropertyOptional({ enum: OrderStatus, isArray: true, description: 'Exact statuses (comma separated); overrides tab' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsArray()
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus[];

  @ApiPropertyOptional({ enum: ['all', 'today', '7', '30', 'custom'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'today', '7', '30', 'custom'])
  range: DateRange = 'all';

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Dhaka calendar day (range=custom)' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Inclusive Dhaka calendar day (range=custom)' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @ApiPropertyOptional({ enum: ['all', 'cod', 'ssl', 'due'], default: 'all', description: 'Storefront shortcut: due = live/delivered and unpaid' })
  @IsOptional()
  @IsIn(['all', 'cod', 'ssl', 'due'])
  pay: 'all' | 'cod' | 'ssl' | 'due' = 'all';

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ enum: ['paid', 'due'] })
  @IsOptional()
  @IsIn(['paid', 'due'])
  paid?: 'paid' | 'due';

  @ApiPropertyOptional({ example: 'book', description: 'বিভাগ (section code)' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  section?: string;

  @ApiPropertyOptional({ enum: ['all', 'flagged', 'urgent', 'NORMAL', 'HIGH', 'URGENT'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'flagged', 'urgent', 'NORMAL', 'HIGH', 'URGENT'])
  priority: 'all' | 'flagged' | 'urgent' | OrderPriority = 'all';

  @ApiPropertyOptional({ description: 'Tag name or id' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  tag?: string;

  @ApiPropertyOptional({ description: 'Customer id' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ enum: ['new', 'old', 'high', 'low', 'prio'], default: 'new' })
  @IsOptional()
  @IsIn(['new', 'old', 'high', 'low', 'prio'])
  sort: 'new' | 'old' | 'high' | 'low' | 'prio' = 'new';
}

export class BoardQueryDto extends OrderFilterDto {
  @ApiPropertyOptional({ default: 40, description: 'Cards per column' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perColumn = 40;
}

export class CreditDto {
  @ApiProperty({ example: 'কাস্টমার ফেরত দিয়েছে' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason: string;

  @ApiPropertyOptional({ default: 0, description: 'Extra courier loss (৳) — its own line on the credit note' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  courierLoss?: number;
}

export class ChangeStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  to: OrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ type: CreditDto, description: 'Required when cancelling / returning a confirmed order' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreditDto)
  credit?: CreditDto;

  @ApiPropertyOptional({ description: 'Optimistic lock: the version you loaded' })
  @IsOptional()
  @IsInt()
  @Min(0)
  version?: number;
}

export class RegressDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  version?: number;
}

export class MarkPaidDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  version?: number;
}

export class BulkIdsDto {
  @ApiProperty({ type: [String], description: 'Order ids or numbers' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  ids: string[];
}

export class BulkStatusDto extends BulkIdsDto {
  @ApiProperty({ enum: ['confirm', 'advance', 'set'], description: 'confirm = pending → confirmed; advance = next step; set = move to `to`' })
  @IsIn(['confirm', 'advance', 'set'])
  action: 'confirm' | 'advance' | 'set';

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  to?: OrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ type: CreditDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreditDto)
  credit?: CreditDto;
}

export class PriorityDto {
  @ApiProperty({ enum: OrderPriority })
  @IsEnum(OrderPriority)
  priority: OrderPriority;
}

export class AddTagDto {
  @ApiProperty({ example: 'উপহার' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name: string;

  @ApiPropertyOptional({ example: '#C58B2A' })
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/)
  color?: string;
}

export class AddNoteDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}

export class PickListQueryDto {
  @ApiPropertyOptional({ description: 'Comma-separated order ids/numbers; default = pending + confirmed + processing' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean) : value))
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids?: string[];
}

export class OrderRefParam {
  @IsString()
  @MaxLength(60)
  id: string;
}

export class NoteParam extends OrderRefParam {
  @IsUUID()
  noteId: string;
}

export class TagParam extends OrderRefParam {
  @IsUUID()
  tagId: string;
}

export class ReopenOrderDto {
  @ApiProperty({ description: 'কেন ফিরিয়ে আনা হচ্ছে — লগে থাকবে', example: 'কাস্টমার ফোন করে আবার চেয়েছেন' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({ enum: ['PENDING', 'CONFIRMED'], description: 'খালি থাকলে: আগে কনফার্ম হয়ে থাকলে CONFIRMED, নাহলে PENDING' })
  @IsOptional()
  @IsIn(['PENDING', 'CONFIRMED'])
  to?: 'PENDING' | 'CONFIRMED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  version?: number;
}
