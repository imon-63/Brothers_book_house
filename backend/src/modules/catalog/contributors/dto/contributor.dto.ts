import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { PageQueryDto } from '@/common/dto/pagination.dto';
import { ToBool, Trim } from '../../shared/query-transforms';

const SLUG = /^[\p{L}\p{M}\p{N}-]+$/u;

export class CreateAuthorDto {
  @ApiProperty({ example: 'হুমায়ূন আহমেদ' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nameBn: string;

  @ApiPropertyOptional({ example: 'Humayun Ahmed' }) @IsOptional() @Trim() @IsString() @MaxLength(160) nameEn?: string | null;
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(150) @Matches(SLUG) slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) bio?: string | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) @IsOptional() @IsUUID() photoId?: string | null;
}

export class UpdateAuthorDto extends PartialType(CreateAuthorDto) {}

export class CreateLabelDto {
  @ApiProperty({ example: 'অনুপম প্রকাশনী' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(150) @Matches(SLUG) slug?: string;
}

export class UpdateLabelDto extends PartialType(CreateLabelDto) {}

export class AdminContributorQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'true → soft-deleted rows' }) @IsOptional() @ToBool() @IsBoolean() deleted?: boolean;
}

export class PublicAuthorQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Section code or id' }) @IsOptional() @Trim() @IsString() @MaxLength(120) section?: string;
  @ApiPropertyOptional({ description: 'Only authors with products in this category (slug or id)' }) @IsOptional() @Trim() @IsString() @MaxLength(120) category?: string;
}
