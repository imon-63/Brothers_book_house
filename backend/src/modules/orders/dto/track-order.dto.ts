import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '@/common/dto/pagination.dto';

export class TrackOrderDto {
  @ApiPropertyOptional({ example: 'CLO-2042', description: 'Order number; omit to list recent orders for the phone' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  orderNo?: string;

  @ApiProperty({ example: '01711111111' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone: string;
}

export class MyOrdersQueryDto extends PageQueryDto {}

export class CancelMyOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
