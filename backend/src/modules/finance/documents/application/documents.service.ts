import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { skipTake, toPage } from '@/common/dto/pagination.dto';
import { NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { AuditService } from '@/platform/audit/audit.service';
import { dayRange } from '../../shared/domain/dhaka-time';
import { renderDocumentHtml } from '../domain/document-html';
import type { DocumentQueryDto } from '../dto/documents.dto';
import { toDocumentDetail, toDocumentSummary, toPrintable } from '../mappers/document.mapper';
import { DocumentIssuerService } from './document-issuer.service';

const detailInclude = {
  order: { select: { orderNo: true, paymentMethod: true, customerId: true } },
  credits: { select: { id: true, docNo: true } },
  creditedBy: { select: { id: true, docNo: true } },
} satisfies Prisma.FinancialDocumentInclude;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly issuer: DocumentIssuerService,
    private readonly audit: AuditService,
  ) {}

  async list(q: DocumentQueryDto) {
    const where: Prisma.FinancialDocumentWhereInput = { kind: q.kind, orderId: q.orderId };
    if (q.from || q.to) where.issuedAt = { gte: q.from ? dayRange(q.from).start : undefined, lt: q.to ? dayRange(q.to).end : undefined };
    if (q.q) {
      where.OR = [
        { docNo: { contains: q.q, mode: 'insensitive' } },
        { customerName: { contains: q.q, mode: 'insensitive' } },
        { customerPhone: { contains: q.q } },
        { order: { orderNo: { contains: q.q, mode: 'insensitive' } } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.financialDocument.findMany({ where, include: { order: { select: { orderNo: true, paymentMethod: true } } }, orderBy: [{ issuedAt: q.order }, { docNo: q.order }], ...skipTake(q) }),
      this.prisma.financialDocument.count({ where }),
    ]);
    return toPage(rows.map(toDocumentSummary), total, q);
  }

  private async load(id: string) {
    const d = await this.prisma.financialDocument.findUnique({ where: { id }, include: detailInclude });
    if (!d) throw new NotFoundError('Document', id);
    return d;
  }

  async get(id: string) {
    return toDocumentDetail(await this.load(id));
  }

  async html(id: string) {
    return renderDocumentHtml(toPrintable(await this.load(id)));
  }

  /** Customer view: only papers of the caller's own orders. */
  async myHtml(id: string, user: AuthUser) {
    const d = await this.load(id);
    this.assertOwner(d.order?.customerId, user);
    return renderDocumentHtml(toPrintable(d));
  }

  async myList(user: AuthUser, orderId?: string) {
    if (!user.customerId) return { items: [] };
    const rows = await this.prisma.financialDocument.findMany({
      where: { orderId, order: { customerId: user.customerId } },
      include: { order: { select: { orderNo: true, paymentMethod: true } } },
      orderBy: { issuedAt: 'desc' },
      take: 100,
    });
    return { items: rows.map(toDocumentSummary) };
  }

  private assertOwner(customerId: string | undefined, user: AuthUser) {
    // 404 rather than 403 so ids of other people's papers are not confirmed
    if (!user.customerId || !customerId || user.customerId !== customerId) throw new NotFoundError('Document');
  }

  /** Staff: re-run the book-keeping for an order (after fixing data / a failed listener). */
  async resync(orderId: string, actor: AuthUser) {
    const exists = await this.prisma.order.findUnique({ where: { id: orderId }, select: { orderNo: true } });
    if (!exists) throw new NotFoundError('Order', orderId);
    const r = await this.issuer.sync(orderId, { actorId: actor.id });
    if (r.issued.length || r.codCashIn) {
      await this.audit.record({
        actor,
        action: 'OTHER',
        area: 'finance',
        entityType: 'Order',
        entityId: orderId,
        summary: `${exists.orderNo} — হিসাব পুনর্মিলন: ${r.issued.map((d) => d.docNo).join(', ') || 'COD ক্যাশ'}`,
      });
    }
    return r;
  }
}
