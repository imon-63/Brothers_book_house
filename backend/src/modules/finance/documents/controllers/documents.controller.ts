import { Controller, Get, Header, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Finance, Staff } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { DocumentsService } from '../application/documents.service';
import { DocumentQueryDto, MyDocumentQueryDto } from '../dto/documents.dto';

@ApiTags('Finance · কাগজ')
@ApiBearerAuth()
@Controller({ path: 'admin/documents', version: '1' })
export class DocumentsAdminController {
  constructor(private readonly docs: DocumentsService) {}

  @Staff()
  @Get()
  @ApiOperation({ summary: 'ইনভয়েস, রিসিট, ক্রেডিট নোট (filter by kind, order, date, q)' })
  list(@Query() q: DocumentQueryDto) {
    return this.docs.list(q);
  }

  @Staff()
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.docs.get(id);
  }

  @Staff()
  @Get(':id/html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'private, no-store')
  @ApiProduces('text/html')
  @ApiOperation({ summary: 'Printable Bangla paper' })
  html(@Param('id', ParseUUIDPipe) id: string) {
    return this.docs.html(id);
  }

  @Finance()
  @Post('resync/:orderId')
  @ApiOperation({ summary: 'Re-run document/COD book-keeping for an order (idempotent)' })
  resync(@Param('orderId', ParseUUIDPipe) orderId: string, @CurrentUser() user: AuthUser) {
    return this.docs.resync(orderId, user);
  }
}

@ApiTags('Me · আমার কাগজ')
@ApiBearerAuth()
@Controller({ path: 'me/documents', version: '1' })
export class MyDocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'My invoices / receipts / credit notes' })
  list(@CurrentUser() user: AuthUser, @Query() q: MyDocumentQueryDto) {
    return this.docs.myList(user, q.orderId);
  }

  @Get(':id/html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'private, no-store')
  @ApiProduces('text/html')
  @ApiOperation({ summary: 'Printable paper of one of my orders' })
  html(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.docs.myHtml(id, user);
  }
}
