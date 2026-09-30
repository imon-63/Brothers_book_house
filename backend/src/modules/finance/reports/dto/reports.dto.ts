import { ApiPropertyOptional } from '@nestjs/swagger';
import { CashTxnKind, DocumentKind } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsUUID, Matches } from 'class-validator';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export class ReportQueryDto {
  @ApiPropertyOptional({ enum: ['day', 'month', 'year', 'custom'], default: 'month' })
  @IsOptional()
  @IsIn(['day', 'month', 'year', 'custom'])
  period?: 'day' | 'month' | 'year' | 'custom';

  @ApiPropertyOptional({ example: '2026-09-29', description: 'Anchor day for day/month/year (default today, Dhaka)' })
  @IsOptional()
  @Matches(ISO_DAY)
  date?: string;

  @ApiPropertyOptional({ example: '2026-09-01', description: 'custom: first day (inclusive)' })
  @IsOptional()
  @Matches(ISO_DAY)
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'custom: last day (inclusive)' })
  @IsOptional()
  @Matches(ISO_DAY)
  to?: string;
}

export class CashbookExportQueryDto extends ReportQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({ enum: CashTxnKind })
  @IsOptional()
  @IsEnum(CashTxnKind)
  kind?: CashTxnKind;
}

export class DocumentsExportQueryDto extends ReportQueryDto {
  @ApiPropertyOptional({ enum: DocumentKind })
  @IsOptional()
  @IsEnum(DocumentKind)
  kind?: DocumentKind;
}
