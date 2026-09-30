import { Body, Controller, Delete, Get, HttpCode, type MessageEvent, Param, ParseUUIDPipe, Patch, Post, Query, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Observable } from 'rxjs';
import { CurrentUser, Managers, Roles } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { InboxService } from '../application/inbox.service';
import { SupportStreamService } from '../application/support-stream.service';
import { AssignDto, CannedReplyDto, InboxQueryDto, SendMessageDto, UpdateCannedReplyDto } from '../dto/support.dto';

@ApiTags('Admin · Support · চ্যাট')
@ApiBearerAuth()
@Roles('ADMIN', 'MANAGER', 'SUPPORT')
@Controller({ path: 'admin/support', version: '1' })
export class SupportAdminController {
  constructor(
    private readonly inbox: InboxService,
    private readonly stream: SupportStreamService,
  ) {}

  @Sse('stream')
  @SkipThrottle()
  @ApiOperation({ summary: 'SSE: every new message / conversation change / read receipt (+ ping every 25s)' })
  live(): Observable<MessageEvent> {
    return this.stream.staff();
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Inbox: filter by status (active = open+pending), unread, assignee (me|none|id), search' })
  list(@CurrentUser() user: AuthUser, @Query() q: InboxQueryDto) {
    return this.inbox.list(user, q);
  }

  @Get('conversations/counts')
  counts(@CurrentUser() user: AuthUser) {
    return this.inbox.counts(user);
  }

  @Get('conversations/:id')
  thread(@Param('id', ParseUUIDPipe) id: string) {
    return this.inbox.thread(id);
  }

  @Post('conversations/:id/messages')
  reply(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendMessageDto) {
    return this.inbox.reply(user, id, dto.body);
  }

  @Post('conversations/:id/read')
  @HttpCode(200)
  read(@Param('id', ParseUUIDPipe) id: string) {
    return this.inbox.markRead(id);
  }

  @Patch('conversations/:id/assign')
  assign(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDto) {
    return this.inbox.assign(user, id, dto.assigneeId ?? null);
  }

  @Post('conversations/:id/resolve')
  @HttpCode(200)
  resolve(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.inbox.transition(user, id, 'resolve');
  }

  @Post('conversations/:id/close')
  @HttpCode(200)
  close(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.inbox.transition(user, id, 'close');
  }

  @Post('conversations/:id/reopen')
  @HttpCode(200)
  reopen(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.inbox.transition(user, id, 'reopen');
  }

  @Post('conversations/:id/pending')
  @HttpCode(200)
  pending(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.inbox.transition(user, id, 'pending');
  }

  @Get('canned-replies')
  canned() {
    return this.inbox.cannedList();
  }

  @Post('canned-replies')
  @Managers()
  cannedCreate(@CurrentUser() user: AuthUser, @Body() dto: CannedReplyDto) {
    return this.inbox.cannedCreate(user, dto);
  }

  @Patch('canned-replies/:id')
  @Managers()
  cannedUpdate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCannedReplyDto) {
    return this.inbox.cannedUpdate(user, id, dto);
  }

  @Delete('canned-replies/:id')
  @Managers()
  @HttpCode(204)
  cannedDelete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.inbox.cannedDelete(user, id);
  }
}
