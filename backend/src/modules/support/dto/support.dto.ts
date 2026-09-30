import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import type { ConversationStatus } from '@prisma/client';
import { PageQueryDto } from '@/common/dto/pagination.dto';

const toBool = ({ value }: { value: unknown }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value);

export class StartConversationDto {
  @ApiPropertyOptional({ description: 'Guest display name (ignored when logged in)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;
}

export class SendMessageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

export class MessagesQueryDto {
  @ApiPropertyOptional({ description: 'Only messages created after this ISO time (polling)' })
  @IsOptional()
  @IsISO8601()
  after?: string;

  @ApiPropertyOptional({ default: 100, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 100;
}

export class InboxQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED', 'active'], description: 'active = OPEN + PENDING' })
  @IsOptional()
  @IsIn(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED', 'active'])
  status?: ConversationStatus | 'active';

  @ApiPropertyOptional({ description: 'Only threads with unread customer messages' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  unread?: boolean;

  @ApiPropertyOptional({ description: '"me", "none" or a staff user id' })
  @IsOptional()
  @ValidateIf((_, v) => v !== 'me' && v !== 'none')
  @IsUUID()
  assignee?: string;
}

export class AssignDto {
  @ApiPropertyOptional({ nullable: true, description: 'Staff user id, or null to unassign' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  assigneeId?: string | null;
}

export class CannedReplyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateCannedReplyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(80) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(2000) body?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}
