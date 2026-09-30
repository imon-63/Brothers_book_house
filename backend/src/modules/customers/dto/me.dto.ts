import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: 'null removes the email' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEmail()
  @MaxLength(160)
  email?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  marketingOptIn?: boolean;
}

export class ChangePhoneDto {
  @ApiProperty({ example: '01711111111' })
  @IsString()
  @MaxLength(20)
  phone!: string;

  @ApiPropertyOptional({ description: 'OTP sent to the new number (not implemented yet)' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  code?: string;
}

export class AddressDto {
  @ApiPropertyOptional({ example: 'বাসা' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  label?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  recipientName!: string;

  @ApiProperty({ example: '01711111111' })
  @IsString()
  @MaxLength(20)
  phone!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  districtId!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  upazila?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  union?: string;

  @ApiProperty({ description: 'গ্রাম / মহল্লা, বাড়ি, রাস্তা' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  line!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  landmark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  postcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) label?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(120) recipientName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) districtId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) upazila?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) union?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(3) @MaxLength(300) line?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) landmark?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10) postcode?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class AddWishlistDto {
  @ApiPropertyOptional({ description: 'Exactly one of productId / bundleId' })
  @ValidateIf((o: AddWishlistDto) => !o.bundleId)
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @ValidateIf((o: AddWishlistDto) => !o.productId)
  @IsUUID()
  bundleId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  notifyOnRestock?: boolean;
}
