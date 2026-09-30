import { Injectable } from '@nestjs/common';
import type { Prisma, UserRole } from '@prisma/client';
import { NotFoundError } from '@/common/errors/domain.error';
import { skipTake, toPage, type PageQueryDto } from '@/common/dto/pagination.dto';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';

export type StaffAlert = { type: string; title: string; body?: string | null; link?: string | null };

/** Who hears about what (OWNER is always included). */
export const ALERT_AUDIENCE: Record<string, UserRole[]> = {
  'order.pending': ['OWNER', 'ADMIN', 'MANAGER', 'SUPPORT'],
  'chat.new': ['OWNER', 'ADMIN', 'MANAGER', 'SUPPORT'],
  'stock.low': ['OWNER', 'ADMIN', 'MANAGER', 'WAREHOUSE'],
};

/** In-app bell for staff. */
@Injectable()
export class StaffNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fan out one alert to every active staff user in the audience. With
   * `collapse`, users who still have an UNREAD alert with the same type+link
   * are skipped (a chatty customer produces one bell item, not twenty).
   */
  async notify(alert: StaffAlert, opts: { collapse?: boolean } = {}) {
    const roles = ALERT_AUDIENCE[alert.type] ?? ['OWNER', 'ADMIN'];
    const users = await this.prisma.user.findMany({ where: { role: { in: roles }, status: 'ACTIVE', deletedAt: null }, select: { id: true } });
    let ids = users.map((u) => u.id);
    if (opts.collapse && alert.link && ids.length) {
      const open = await this.prisma.staffNotification.findMany({ where: { userId: { in: ids }, type: alert.type, link: alert.link, readAt: null }, select: { userId: true } });
      const skip = new Set(open.map((o) => o.userId));
      ids = ids.filter((id) => !skip.has(id));
    }
    if (!ids.length) return 0;
    const r = await this.prisma.staffNotification.createMany({
      data: ids.map((userId) => ({ userId, type: alert.type, title: alert.title.slice(0, 300), body: alert.body ?? null, link: alert.link ?? null })),
    });
    return r.count;
  }

  async list(user: AuthUser, q: PageQueryDto & { unread?: boolean }) {
    const where: Prisma.StaffNotificationWhereInput = { userId: user.id, ...(q.unread ? { readAt: null } : {}) };
    const [rows, total, unread] = await Promise.all([
      this.prisma.staffNotification.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(q) }),
      this.prisma.staffNotification.count({ where }),
      this.prisma.staffNotification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return { unread, ...toPage(rows.map(({ userId: _u, ...n }) => n), total, q) };
  }

  async unreadCount(user: AuthUser) {
    return { unread: await this.prisma.staffNotification.count({ where: { userId: user.id, readAt: null } }) };
  }

  async markRead(user: AuthUser, id: string) {
    const r = await this.prisma.staffNotification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
    if (!r.count) {
      const exists = await this.prisma.staffNotification.count({ where: { id, userId: user.id } });
      if (!exists) throw new NotFoundError('Notification', id);
    }
    return this.unreadCount(user);
  }

  async markAllRead(user: AuthUser) {
    const r = await this.prisma.staffNotification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { marked: r.count, unread: 0 };
  }

  /** Housekeeping: read alerts older than `days` are dropped. */
  purgeRead(days = 60) {
    return this.prisma.staffNotification.deleteMany({ where: { readAt: { lt: new Date(Date.now() - days * 86_400_000) } } });
  }
}
