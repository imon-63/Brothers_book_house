import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PageQueryDto } from '@/common/dto/pagination.dto';
import { SEGMENTS, type Segment } from '../domain/segment';

export const toBool = ({ value }: { value: unknown }) => (value === 'true' || value === '1' || value === true ? true : value === 'false' || value === '0' || value === false ? false : value);

export const CUSTOMER_SORTS = ['last', 'spent', 'orders', 'aov', 'name', 'created'] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export class CustomerFilterDto {
  @ApiPropertyOptional({ enum: SEGMENTS })
  @IsOptional()
  @IsIn(SEGMENTS)
  segment?: Segment;

  @ApiPropertyOptional({ enum: ['registered', 'guest'] })
  @IsOptional()
  @IsIn(['registered', 'guest'])
  kind?: 'registered' | 'guest';

  @ApiPropertyOptional({ description: 'Tag name (scope CUSTOMER)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  tag?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  blocked?: boolean;

  @ApiPropertyOptional({ description: 'Name, email, phone digits (≥3) or exact order no' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SORTS, default: 'last' })
  @IsOptional()
  @IsIn(CUSTOMER_SORTS)
  sort: CustomerSort = 'last';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';
}

export class CustomerListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: SEGMENTS })
  @IsOptional()
  @IsIn(SEGMENTS)
  segment?: Segment;

  @ApiPropertyOptional({ enum: ['registered', 'guest'] })
  @IsOptional()
  @IsIn(['registered', 'guest'])
  kind?: 'registered' | 'guest';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  tag?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  blocked?: boolean;

  @ApiPropertyOptional({ enum: CUSTOMER_SORTS, default: 'last' })
  @IsOptional()
  @IsIn(CUSTOMER_SORTS)
  sort: CustomerSort = 'last';
}

export class UpdateCustomerDto {
  @ApiPropertyOptional({ description: 'Private staff note (null clears)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  marketingOptIn?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;
}

export class AddNoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}

export class PinNoteDto {
  @ApiProperty()
  @IsBoolean()
  isPinned!: boolean;
}

export class SetTagsDto {
  @ApiProperty({ type: [String], example: ['VIP', 'পাইকারি'] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(40, { each: true })
  tags!: string[];
}

export class BulkTagDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  customerIds!: string[];

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  tag!: string;

  @ApiProperty({ enum: ['add', 'remove'] })
  @IsIn(['add', 'remove'])
  action!: 'add' | 'remove';
}

export class BlockCustomerDto {
  @ApiProperty({ example: 'বারবার অর্ডার নিয়ে ফেরত দিচ্ছেন' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}
