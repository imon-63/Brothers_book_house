import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { NotificationChannel, OutboxStatus } from '@prisma/client';
import { PageQueryDto } from '@/common/dto/pagination.dto';

export class StaffNotificationQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Only unread' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value))
  @IsBoolean()
  unread?: boolean;
}

export class OutboxQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED'])
  status?: OutboxStatus;

  @ApiPropertyOptional({ enum: ['SMS', 'EMAIL', 'WHATSAPP', 'PUSH'] })
  @IsOptional()
  @IsIn(['SMS', 'EMAIL', 'WHATSAPP', 'PUSH'])
  channel?: NotificationChannel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  template?: string;
}
