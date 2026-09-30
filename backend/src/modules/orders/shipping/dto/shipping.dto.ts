import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CodStatus, ShipmentStatus, ShippingRuleType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, IsUrl, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { PageQueryDto } from '@/common/dto/pagination.dto';

export const COURIER_CODES = ['pathao', 'steadfast', 'redx', 'sundarban', 'ecourier', 'other'] as const;

const money = { maxDecimalPlaces: 2 } as const;

export class ShippingQuoteQueryDto {
  @ApiProperty({ description: 'District id or name', example: 'ঢাকা' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  district: string;
}

export class CreateZoneDto {
  @ApiProperty({ example: 'inside_dhaka' })
  @Matches(/^[a-z0-9_]{2,30}$/)
  code: string;

  @ApiProperty({ example: 'ঢাকার ভিতর' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nameBn: string;

  @ApiProperty({ description: 'Charged to the customer (৳)' })
  @IsNumber(money)
  @Min(0)
  fee: number;

  @ApiProperty({ description: 'Our expected courier cost (৳)' })
  @IsNumber(money)
  @Min(0)
  courierCost: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  etaMinDays?: number;

  @ApiPropertyOptional({ default: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  etaMaxDays?: number;
}

export class UpdateZoneDto extends PartialType(CreateZoneDto) {}

export class CreateShippingRuleDto {
  @ApiProperty({ enum: ShippingRuleType })
  @IsEnum(ShippingRuleType)
  type: ShippingRuleType;

  @ApiProperty({ example: '৳৫০০+ অর্ডারে ফ্রি' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label: string;

  @ApiPropertyOptional({ description: 'MIN_SUBTOTAL threshold (৳)' })
  @IsOptional()
  @IsNumber(money)
  @Min(0.01)
  minSubtotal?: number | null;

  @ApiPropertyOptional({ description: 'SECTION_ONLY: section code (book/food/gadget) or id' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  section?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(-100)
  @Max(100)
  priority?: number;
}

export class UpdateShippingRuleDto extends PartialType(CreateShippingRuleDto) {}

export class CreateCourierDto {
  @ApiProperty({ enum: COURIER_CODES })
  @IsIn(COURIER_CODES as unknown as string[])
  code: string;

  @ApiProperty({ example: 'Pathao' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({ example: 'https://merchant.pathao.com/tracking?consignment_id={tracking}' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(300)
  trackingUrl?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Non-secret API config' })
  @IsOptional()
  @IsObject()
  apiConfig?: Record<string, unknown>;
}

export class UpdateCourierDto extends PartialType(CreateCourierDto) {}

export class AssignShipmentDto {
  @ApiProperty({ description: 'Order id (uuid) or order no (CLO-2042)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  order: string;

  @ApiProperty({ description: 'Courier id or code (pathao, steadfast…)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  courier: string;

  @ApiPropertyOptional({ example: 'DT041912' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  trackingNo?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  consignmentId?: string | null;

  @ApiPropertyOptional({ description: 'What the courier bills us; default = zone courier cost' })
  @IsOptional()
  @IsNumber(money)
  @Min(0)
  deliveryCharge?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  weightGrams?: number;
}

export class UpdateShipmentDto {
  @ApiPropertyOptional({ enum: ShipmentStatus })
  @IsOptional()
  @IsEnum(ShipmentStatus)
  status?: ShipmentStatus;

  @ApiPropertyOptional({ enum: CodStatus })
  @IsOptional()
  @IsEnum(CodStatus)
  codStatus?: CodStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber(money)
  @Min(0)
  deliveryCharge?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber(money)
  @Min(0)
  returnCharge?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  trackingNo?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  consignmentId?: string | null;
}

export class ShipmentListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ShipmentStatus })
  @IsOptional()
  @IsEnum(ShipmentStatus)
  status?: ShipmentStatus;

  @ApiPropertyOptional({ enum: CodStatus })
  @IsOptional()
  @IsEnum(CodStatus)
  codStatus?: CodStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  courierId?: string;
}

export class IdParam {
  @IsUUID()
  id: string;
}

export class IntIdParam {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id: number;
}
