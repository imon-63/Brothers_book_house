import { Injectable } from '@nestjs/common';
import { toNumber } from '@/common/utils/money';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { StoreSettingsService } from './store-settings.service';

/** Everything the storefront chrome needs in one cheap call. */
@Injectable()
export class StorefrontService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: StoreSettingsService,
  ) {}

  @Traced('content.storefront')
  async storefront(now = new Date()) {
    const live = { isActive: true, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] };
    const [announcements, promo, slides, settings] = await Promise.all([
      this.prisma.announcement.findMany({ where: live, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, text: true, linkUrl: true } }),
      this.prisma.promoPopup.findFirst({
        where: live,
        orderBy: { updatedAt: 'desc' },
        include: { coupon: { select: { code: true, type: true, value: true, description: true, minSubtotal: true, isActive: true, deletedAt: true, startsAt: true, endsAt: true } }, image: { select: { url: true, alt: true } } },
      }),
      this.prisma.heroSlide.findMany({
        where: { ...live, section: { isVisible: true } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: { section: { select: { code: true } }, category: { select: { slug: true, nameBn: true } }, image: { select: { url: true, alt: true } } },
      }),
      this.settings.publicSubset(),
    ]);

    const couponLive = (c: NonNullable<typeof promo>['coupon']) =>
      !!c && c.isActive && !c.deletedAt && (!c.startsAt || c.startsAt <= now) && (!c.endsAt || c.endsAt > now);

    const hero: Record<string, unknown[]> = {};
    for (const s of slides) {
      (hero[s.section.code] ??= []).push({
        id: s.id, kicker: s.kicker, title: s.title, subtitle: s.subtitle,
        imageUrl: s.image?.url ?? s.imageUrl, imageAlt: s.image?.alt ?? null,
        category: s.category ? { slug: s.category.slug, name: s.category.nameBn } : null,
      });
    }

    // A popup pointing at a dead coupon is hidden rather than advertising an unusable code.
    const showPromo = promo && (!promo.couponId || couponLive(promo.coupon));
    return {
      announcements,
      promo: showPromo
        ? {
            id: promo.id, title: promo.title, body: promo.body, ctaLabel: promo.ctaLabel, ctaUrl: promo.ctaUrl,
            imageUrl: promo.image?.url ?? null,
            coupon: promo.coupon ? { code: promo.coupon.code, type: promo.coupon.type, value: toNumber(promo.coupon.value), minSubtotal: toNumber(promo.coupon.minSubtotal), description: promo.coupon.description, endsAt: promo.coupon.endsAt } : null,
          }
        : null,
      hero,
      settings,
    };
  }
}
