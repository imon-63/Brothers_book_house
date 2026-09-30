import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService, type Tx } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { checkReorder } from '../domain/store-settings';
import type { CreateAnnouncementDto, CreateHeroSlideDto, CreatePromoDto, UpdateAnnouncementDto, UpdateHeroSlideDto, UpdatePromoDto } from '../dto/content.dto';

const promoInclude = { coupon: { select: { id: true, code: true, isActive: true, endsAt: true } }, image: { select: { id: true, url: true } } } as const;
const slideInclude = { section: { select: { id: true, code: true, nameBn: true } }, category: { select: { id: true, nameBn: true, slug: true } }, image: { select: { id: true, url: true } } } as const;

function window(dto: { startsAt?: Date | null; endsAt?: Date | null }, cur?: { startsAt: Date | null; endsAt: Date | null }) {
  const s = dto.startsAt === undefined ? cur?.startsAt : dto.startsAt;
  const e = dto.endsAt === undefined ? cur?.endsAt : dto.endsAt;
  if (s && e && e <= s) throw new BusinessRuleError('content.window_invalid', 'শেষের সময় শুরুর পরে হতে হবে');
}

/** Admin CRUD for storefront content: announcements (top bar), promo popup, hero slides. */
@Injectable()
export class ContentAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── announcements (টপবার) ───

  announcements() {
    return this.prisma.announcement.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }

  async createAnnouncement(actor: AuthUser, dto: CreateAnnouncementDto) {
    window(dto);
    return this.prisma.tx(async (tx) => {
      const last = await tx.announcement.aggregate({ _max: { sortOrder: true } });
      const a = await tx.announcement.create({ data: { ...dto, text: dto.text.trim(), sortOrder: (last._max.sortOrder ?? -1) + 1 } });
      await this.log(tx, actor, 'CREATE', 'announcement', a.id, `টপবারে যোগ: ${a.text}`);
      return a;
    });
  }

  async updateAnnouncement(actor: AuthUser, id: string, dto: UpdateAnnouncementDto) {
    return this.prisma.tx(async (tx) => {
      const cur = await tx.announcement.findUnique({ where: { id } });
      if (!cur) throw new NotFoundError('Announcement', id);
      window(dto, cur);
      const a = await tx.announcement.update({ where: { id }, data: { ...dto, text: dto.text?.trim() } });
      const d = AuditService.diff(cur as unknown as Record<string, unknown>, dto as Record<string, unknown>);
      await this.log(tx, actor, 'UPDATE', 'announcement', id, `টপবার বদলানো: ${a.text}`, d.before, d.after);
      return a;
    });
  }

  async deleteAnnouncement(actor: AuthUser, id: string) {
    await this.prisma.tx(async (tx) => {
      const cur = await tx.announcement.findUnique({ where: { id } });
      if (!cur) throw new NotFoundError('Announcement', id);
      await tx.announcement.delete({ where: { id } });
      await this.log(tx, actor, 'DELETE', 'announcement', id, `টপবার থেকে মুছে ফেলা: ${cur.text}`);
    });
  }

  async reorderAnnouncements(actor: AuthUser, ids: string[]) {
    return this.prisma.tx(async (tx) => {
      const cur = await tx.announcement.findMany({ select: { id: true } });
      const err = checkReorder(cur.map((c) => c.id), ids);
      if (err) throw new BusinessRuleError('content.reorder_invalid', err);
      await Promise.all(ids.map((id, i) => tx.announcement.update({ where: { id }, data: { sortOrder: i } })));
      await this.log(tx, actor, 'UPDATE', 'announcement', null, 'টপবারের ক্রম বদলানো হয়েছে');
      return tx.announcement.findMany({ orderBy: { sortOrder: 'asc' } });
    });
  }

  // ─── promo popup (one active at a time) ───

  promos() {
    return this.prisma.promoPopup.findMany({ include: promoInclude, orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] });
  }

  @Traced('content.promo_create')
  async createPromo(actor: AuthUser, dto: CreatePromoDto) {
    window(dto);
    await this.checkRefs(dto);
    return this.prisma.tx(async (tx) => {
      if (dto.isActive) await tx.promoPopup.updateMany({ where: { isActive: true }, data: { isActive: false } });
      const p = await tx.promoPopup.create({ data: { ...dto, title: dto.title.trim() }, include: promoInclude });
      await this.log(tx, actor, 'CREATE', 'promo_popup', p.id, `অফার পপআপ তৈরি: ${p.title}${p.isActive ? ' (চালু)' : ''}`);
      return p;
    });
  }

  async updatePromo(actor: AuthUser, id: string, dto: UpdatePromoDto) {
    await this.checkRefs(dto);
    return this.prisma.tx(async (tx) => {
      const cur = await tx.promoPopup.findUnique({ where: { id } });
      if (!cur) throw new NotFoundError('PromoPopup', id);
      window(dto, cur);
      if (dto.isActive) await tx.promoPopup.updateMany({ where: { isActive: true, NOT: { id } }, data: { isActive: false } });
      const p = await tx.promoPopup.update({ where: { id }, data: { ...dto, title: dto.title?.trim() }, include: promoInclude });
      const d = AuditService.diff(cur as unknown as Record<string, unknown>, dto as Record<string, unknown>);
      await this.log(tx, actor, 'UPDATE', 'promo_popup', id, `অফার পপআপ বদলানো: ${p.title}`, d.before, d.after);
      return p;
    });
  }

  setPromoActive(actor: AuthUser, id: string, isActive: boolean) {
    return this.updatePromo(actor, id, { isActive });
  }

  async deletePromo(actor: AuthUser, id: string) {
    await this.prisma.tx(async (tx) => {
      const cur = await tx.promoPopup.findUnique({ where: { id } });
      if (!cur) throw new NotFoundError('PromoPopup', id);
      await tx.promoPopup.delete({ where: { id } });
      await this.log(tx, actor, 'DELETE', 'promo_popup', id, `অফার পপআপ মুছে ফেলা: ${cur.title}`);
    });
  }

  // ─── hero slides ───

  slides(sectionId?: string) {
    return this.prisma.heroSlide.findMany({ where: { sectionId }, include: slideInclude, orderBy: [{ sectionId: 'asc' }, { sortOrder: 'asc' }] });
  }

  async createSlide(actor: AuthUser, dto: CreateHeroSlideDto) {
    window(dto);
    await this.checkSlideRefs(dto.sectionId, dto.categoryId, dto.imageId);
    return this.prisma.tx(async (tx) => {
      const last = await tx.heroSlide.aggregate({ where: { sectionId: dto.sectionId }, _max: { sortOrder: true } });
      const s = await tx.heroSlide.create({ data: { ...dto, sortOrder: dto.sortOrder ?? (last._max.sortOrder ?? -1) + 1 }, include: slideInclude });
      await this.log(tx, actor, 'CREATE', 'hero_slide', s.id, `হিরো স্লাইড যোগ: ${s.title} (${s.section.nameBn})`);
      return s;
    });
  }

  async updateSlide(actor: AuthUser, id: string, dto: UpdateHeroSlideDto) {
    return this.prisma.tx(async (tx) => {
      const cur = await tx.heroSlide.findUnique({ where: { id } });
      if (!cur) throw new NotFoundError('HeroSlide', id);
      window(dto, cur);
      await this.checkSlideRefs(dto.sectionId ?? cur.sectionId, dto.categoryId === undefined ? cur.categoryId : dto.categoryId, dto.imageId);
      const s = await tx.heroSlide.update({ where: { id }, data: dto, include: slideInclude });
      const d = AuditService.diff(cur as unknown as Record<string, unknown>, dto as Record<string, unknown>);
      await this.log(tx, actor, 'UPDATE', 'hero_slide', id, `হিরো স্লাইড বদলানো: ${s.title}`, d.before, d.after);
      return s;
    });
  }

  async deleteSlide(actor: AuthUser, id: string) {
    await this.prisma.tx(async (tx) => {
      const cur = await tx.heroSlide.findUnique({ where: { id } });
      if (!cur) throw new NotFoundError('HeroSlide', id);
      await tx.heroSlide.delete({ where: { id } });
      await this.log(tx, actor, 'DELETE', 'hero_slide', id, `হিরো স্লাইড মুছে ফেলা: ${cur.title}`);
    });
  }

  async reorderSlides(actor: AuthUser, sectionId: string, ids: string[]) {
    return this.prisma.tx(async (tx) => {
      const cur = await tx.heroSlide.findMany({ where: { sectionId }, select: { id: true } });
      const err = checkReorder(cur.map((c) => c.id), ids);
      if (err) throw new BusinessRuleError('content.reorder_invalid', err);
      await Promise.all(ids.map((id, i) => tx.heroSlide.update({ where: { id }, data: { sortOrder: i } })));
      await this.log(tx, actor, 'UPDATE', 'hero_slide', sectionId, 'হিরো স্লাইডের ক্রম বদলানো হয়েছে');
      return tx.heroSlide.findMany({ where: { sectionId }, include: slideInclude, orderBy: { sortOrder: 'asc' } });
    });
  }

  // ─── internals ───

  private async checkRefs(dto: { couponId?: string | null; imageId?: string | null }) {
    if (dto.couponId) {
      const c = await this.prisma.coupon.findFirst({ where: { id: dto.couponId, deletedAt: null }, select: { id: true } });
      if (!c) throw new BusinessRuleError('content.coupon_invalid', 'কুপনটি পাওয়া যায়নি');
    }
    if (dto.imageId) await this.checkImage(dto.imageId);
  }

  private async checkSlideRefs(sectionId: string, categoryId?: string | null, imageId?: string | null) {
    const s = await this.prisma.section.findUnique({ where: { id: sectionId }, select: { id: true } });
    if (!s) throw new BusinessRuleError('content.section_invalid', 'বিভাগটি পাওয়া যায়নি');
    if (categoryId) {
      const c = await this.prisma.category.findFirst({ where: { id: categoryId, sectionId, deletedAt: null }, select: { id: true } });
      if (!c) throw new BusinessRuleError('content.category_invalid', 'ক্যাটাগরিটি এই বিভাগে নেই');
    }
    if (imageId) await this.checkImage(imageId);
  }

  private async checkImage(id: string) {
    const m = await this.prisma.mediaAsset.findUnique({ where: { id }, select: { id: true } });
    if (!m) throw new BusinessRuleError('content.image_invalid', 'ছবিটি পাওয়া যায়নি');
  }

  private log(tx: Tx, actor: AuthUser, action: 'CREATE' | 'UPDATE' | 'DELETE', entityType: string, entityId: string | null, summary: string, before?: Prisma.InputJsonValue, after?: Prisma.InputJsonValue) {
    return this.audit.record({ actor, action, area: 'settings', entityType, entityId, summary, before, after }, tx);
  }
}
