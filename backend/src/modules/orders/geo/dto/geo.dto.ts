import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class DistrictsQueryDto {
  @ApiPropertyOptional({ description: 'Division id or name (বাংলা / English)', example: 'ঢাকা' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  division?: string;
}

export class UpazilasQueryDto {
  @ApiProperty({ description: 'District id or name', example: 'ঢাকা' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  district: string;
}

export class UnionsQueryDto {
  @ApiProperty({ description: 'Upazila id or Bangla name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  upazila: string;
}
