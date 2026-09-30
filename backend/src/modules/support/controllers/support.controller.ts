import { Body, Controller, Get, Headers, HttpCode, type MessageEvent, Param, ParseUUIDPipe, Post, Query, Sse } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Observable } from 'rxjs';
import { CurrentUser, OptionalAuth } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { ChatService } from '../application/chat.service';
import { SupportStreamService } from '../application/support-stream.service';
import { MessagesQueryDto, SendMessageDto, StartConversationDto } from '../dto/support.dto';

const TOKEN_HEADER = 'x-chat-token';

/**
 * Storefront chat. Logged-in customers are identified by their JWT; guests by
 * the `chatToken` returned from POST /conversations, sent back as the
 * `x-chat-token` header (or `?token=` on the SSE endpoint, since EventSource
 * cannot set headers).
 */
@ApiTags('Support · চ্যাট')
@ApiHeader({ name: TOKEN_HEADER, required: false, description: 'Guest chat token' })
@OptionalAuth()
@Controller({ path: 'support/conversations', version: '1' })
export class SupportController {
  constructor(
    private readonly chat: ChatService,
    private readonly stream: SupportStreamService,
  ) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Start (or continue) a conversation with a first message; guests receive chatToken once' })
  start(@CurrentUser() user: AuthUser | undefined, @Headers(TOKEN_HEADER) token: string | undefined, @Body() dto: StartConversationDto) {
    return this.chat.start({ user, guestToken: token }, dto);
  }

  @Get('current')
  current(@CurrentUser() user: AuthUser | undefined, @Headers(TOKEN_HEADER) token: string | undefined) {
    return this.chat.current({ user, guestToken: token });
  }

  @Get(':id/messages')
  messages(@CurrentUser() user: AuthUser | undefined, @Headers(TOKEN_HEADER) token: string | undefined, @Param('id', ParseUUIDPipe) id: string, @Query() q: MessagesQueryDto) {
    return this.chat.messages({ user, guestToken: token }, id, q);
  }

  @Post(':id/messages')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  send(@CurrentUser() user: AuthUser | undefined, @Headers(TOKEN_HEADER) token: string | undefined, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendMessageDto) {
    return this.chat.send({ user, guestToken: token }, id, dto.body);
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@CurrentUser() user: AuthUser | undefined, @Headers(TOKEN_HEADER) token: string | undefined, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.markRead({ user, guestToken: token }, id);
  }

  @Sse(':id/stream')
  @SkipThrottle()
  @ApiOperation({ summary: 'Server-Sent Events for one conversation (message / conversation / read / ping)' })
  async live(
    @CurrentUser() user: AuthUser | undefined,
    @Headers(TOKEN_HEADER) header: string | undefined,
    @Query('token') queryToken: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Observable<MessageEvent>> {
    await this.chat.mustAccess({ user, guestToken: header ?? queryToken }, id);
    return this.stream.conversation(id);
  }
}
