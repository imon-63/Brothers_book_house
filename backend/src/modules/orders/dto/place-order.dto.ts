import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderPriority, OrderSource, PaymentMethod } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { QuoteLineDto } from '../pricing/dto/quote-line.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' && !value.trim() ? undefined : typeof value === 'string' ? value.trim() : value);

export class ContactDto {
  @ApiProperty({ example: 'রাফি আহমেদ' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'পূর্ণ নাম লিখুন' })
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: '01711111111' })
  @IsString()
  @IsNotEmpty({ message: 'মোবাইল নম্বর দিন' })
  @MaxLength(20)
  phone: string;

  @ApiPropertyOptional({ example: 'rafi@gmail.com' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEmail({}, { message: 'সঠিক ইমেইল দিন' })
  @MaxLength(160)
  email?: string;
}

export class AddressDto {
  @ApiPropertyOptional({ description: 'District id (or give `district`)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  districtId?: number;

  @ApiPropertyOptional({ example: 'ঢাকা' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  district?: string;

  @ApiPropertyOptional({ example: 'ধানমন্ডি' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(80)
  upazila?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(80)
  union?: string;

  @ApiProperty({ description: 'গ্রাম / মহল্লা, বাড়ি, রাস্তা' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'বিস্তারিত ঠিকানা লিখুন' })
  @MaxLength(500)
  line: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(200)
  landmark?: string;
}

/** Fields shared by storefront and staff orders. */
export class OrderBaseDto {
  @ApiProperty({ type: [QuoteLineDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'কার্ট খালি' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  lines: QuoteLineDto[];

  @ApiProperty({ type: ContactDto })
  @ValidateNested()
  @Type(() => ContactDto)
  contact: ContactDto;

  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @ApiPropertyOptional({ example: 'CHOLO10' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(40)
  couponCode?: string;

  @ApiPropertyOptional({ description: 'Note from the customer' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(500)
  customerNote?: string;

  @ApiPropertyOptional({ default: true, description: "Empty the caller's server cart after placing" })
  @IsOptional()
  @IsBoolean()
  clearCart?: boolean;
}

export class PlaceOrderDto extends OrderBaseDto {
  @ApiProperty({ enum: ['COD', 'SSLCOMMERZ'] })
  @IsIn(['COD', 'SSLCOMMERZ'])
  paymentMethod: PaymentMethod;
}

/** Phone / admin order keyed in by staff (any payment method). */
export class AdminCreateOrderDto extends OrderBaseDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ enum: ['PHONE', 'ADMIN', 'SOCIAL'], default: 'PHONE' })
  @IsOptional()
  @IsIn(['PHONE', 'ADMIN', 'SOCIAL'])
  source?: OrderSource;

  @ApiPropertyOptional({ enum: OrderPriority })
  @IsOptional()
  @IsEnum(OrderPriority)
  priority?: OrderPriority;

  @ApiPropertyOptional({ description: 'Internal note (added to the order notes)' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(1000)
  staffNote?: string;
}
