import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, Finance } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { FinanceReportsService } from '../application/finance-reports.service';
import { CashbookExportQueryDto, DocumentsExportQueryDto, ReportQueryDto } from '../dto/reports.dto';

function sendCsv(res: Response, file: { filename: string; body: string }) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(file.body);
}

@ApiTags('Finance · রিপোর্ট')
@ApiBearerAuth()
@Finance()
@Controller({ path: 'admin/finance/reports', version: '1' })
export class FinanceReportsAdminController {
  constructor(private readonly reports: FinanceReportsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'সারাংশ — billed, cash in hand, COD due, stock value, supplier & courier due' })
  summary(@Query() q: ReportQueryDto) {
    return this.reports.summary(q);
  }

  @Get('pnl')
  @ApiOperation({ summary: 'লাভ-ক্ষতি for day / month / year / custom (from papers with cost snapshots)' })
  pnl(@Query() q: ReportQueryDto) {
    return this.reports.pnl(q);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Category margin rows' })
  categories(@Query() q: ReportQueryDto) {
    return this.reports.categories(q);
  }

  @Get('pnl.csv')
  @ApiProduces('text/csv')
  async pnlCsv(@Query() q: ReportQueryDto, @CurrentUser() user: AuthUser, @Res() res: Response) {
    sendCsv(res, await this.reports.pnlCsv(q, user));
  }

  @Get('cashbook.csv')
  @ApiProduces('text/csv')
  async cashbookCsv(@Query() q: CashbookExportQueryDto, @CurrentUser() user: AuthUser, @Res() res: Response) {
    sendCsv(res, await this.reports.cashbookCsv(q, user));
  }

  @Get('documents.csv')
  @ApiProduces('text/csv')
  async documentsCsv(@Query() q: DocumentsExportQueryDto, @CurrentUser() user: AuthUser, @Res() res: Response) {
    sendCsv(res, await this.reports.documentsCsv(q, user));
  }
}
