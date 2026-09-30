import { Controller, Get, Header, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Staff } from '@/common/decorators/auth.decorators';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { toCsv } from '@/modules/finance/reports/domain/csv';

const AREAS = ['order', 'product', 'finance', 'settings', 'customer', 'chat', 'auth', 'inventory'];

class ActivityQuery {
  @IsOptional() @IsIn(AREAS) area?: string;
  @IsOptional() @IsUUID() actorId?: string;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  /** keyset cursor: return rows with id < before */
  @IsOptional() @IsString() before?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 40;
}

function where(q: ActivityQuery): Prisma.AuditLogWhereInput {
  return {
    area: q.area,
    actorId: q.actorId,
    createdAt: q.from || q.to ? { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined } : undefined,
    ...(q.q ? { OR: [{ summary: { contains: q.q, mode: 'insensitive' } }, { entityId: { contains: q.q } }, { actorName: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
}

/**
 * অ্যাক্টিভিটি লগ — read-only view over audit_logs (append-only; there is
 * deliberately no delete endpoint). Keyset pagination keeps it fast at any size.
 */
@ApiTags('Admin · Activity')
@ApiBearerAuth()
@Staff()
@Controller({ path: 'admin/activity', version: '1' })
export class ActivityAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async feed(@Query() q: ActivityQuery) {
    const rows = await this.prisma.auditLog.findMany({
      where: { ...where(q), ...(q.before ? { id: { lt: BigInt(q.before) } } : {}) },
      orderBy: { id: 'desc' },
      take: q.limit + 1,
    });
    const items = rows.slice(0, q.limit).map((r) => ({ ...r, id: r.id.toString() }));
    return { items, nextCursor: rows.length > q.limit ? items[items.length - 1].id : null };
  }

  @Get('stats')
  async stats() {
    const [today, week, areas, days] = await Promise.all([
      this.prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) n FROM audit_logs WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Dhaka') AT TIME ZONE 'Asia/Dhaka'`,
      this.prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) n FROM audit_logs WHERE created_at >= now() - interval '7 days'`,
      this.prisma.$queryRaw<{ area: string; n: bigint }[]>`SELECT area, count(*) n FROM audit_logs WHERE created_at >= now() - interval '30 days' GROUP BY area ORDER BY n DESC`,
      this.prisma.$queryRaw<{ day: string; n: bigint }[]>`
        SELECT to_char(d, 'YYYY-MM-DD') AS day, count(a.id) AS n
          FROM generate_series((now() AT TIME ZONE 'Asia/Dhaka')::date - 13, (now() AT TIME ZONE 'Asia/Dhaka')::date, '1 day') d
          LEFT JOIN audit_logs a ON (a.created_at AT TIME ZONE 'Asia/Dhaka')::date = d
         GROUP BY d ORDER BY d`,
    ]);
    return {
      today: Number(today[0]?.n ?? 0),
      week: Number(week[0]?.n ?? 0),
      topArea: areas[0] ? { area: areas[0].area, count: Number(areas[0].n) } : null,
      byArea: areas.map((a) => ({ area: a.area, count: Number(a.n) })),
      daily: days.map((d) => ({ day: d.day, count: Number(d.n) })),
    };
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="activity.csv"')
  async export(@Query() q: ActivityQuery) {
    const rows = await this.prisma.auditLog.findMany({ where: where(q), orderBy: { id: 'desc' }, take: 10_000 });
    return toCsv(['time', 'who', 'area', 'action', 'summary', 'entity', 'entity_id'], rows.map((r) => [r.createdAt, r.actorName, r.area, r.action, r.summary, r.entityType, r.entityId]));
  }
}

@Module({ controllers: [ActivityAdminController] })
export class ActivityModule {}
