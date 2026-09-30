import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Managers, Staff } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { OutboxAdminService } from '../application/outbox-admin.service';
import { StaffNotificationsService } from '../application/staff-notifications.service';
import { OutboxQueryDto, StaffNotificationQueryDto } from '../dto/notifications.dto';

@ApiTags('Admin · Notifications · নোটিফিকেশন')
@ApiBearerAuth()
@Staff()
@Controller({ path: 'admin/notifications', version: '1' })
export class NotificationsAdminController {
  constructor(
    private readonly bell: StaffNotificationsService,
    private readonly outbox: OutboxAdminService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'My bell notifications (newest first) + unread count' })
  list(@CurrentUser() user: AuthUser, @Query() q: StaffNotificationQueryDto) {
    return this.bell.list(user, q);
  }

  @Get('unread-count')
  unread(@CurrentUser() user: AuthUser) {
    return this.bell.unreadCount(user);
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: AuthUser) {
    return this.bell.markAllRead(user);
  }

  @Get('outbox')
  @Managers()
  @ApiOperation({ summary: 'SMS/email outbox with delivery status (recipients masked, secrets redacted)' })
  outboxList(@Query() q: OutboxQueryDto) {
    return this.outbox.list(q);
  }

  @Post('outbox/:id/retry')
  @Managers()
  @HttpCode(200)
  retry(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.outbox.retry(user, id);
  }

  @Post('outbox/:id/cancel')
  @Managers()
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.outbox.cancel(user, id);
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bell.markRead(user, id);
  }
}
