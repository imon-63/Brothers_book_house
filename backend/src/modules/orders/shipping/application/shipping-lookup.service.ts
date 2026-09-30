import { Injectable } from '@nestjs/common';
import { D } from '@/common/utils/money';
import { PrismaService, type Db } from '@/infrastructure/prisma/prisma.service';
import { ruleIsLive, shippingNote, type FreeShippingRule, type ZoneInfo } from '../domain/shipping-fee';

/** Read side used by pricing: zones and free-delivery rules in domain shape. */
@Injectable()
export class ShippingLookupService {
  constructor(private readonly prisma: PrismaService) {}

  async zones(db: Db = this.prisma): Promise<ZoneInfo[]> {
    return db.shippingZone.findMany({ orderBy: [{ fee: 'asc' }, { id: 'asc' }] });
  }

  /** Active rules (window checked by the domain against `now`). */
  async activeRules(db: Db = this.prisma): Promise<FreeShippingRule[]> {
    return db.shippingRule.findMany({
      where: { isActive: true },
      select: { id: true, type: true, label: true, minSubtotal: true, sectionId: true, startsAt: true, endsAt: true, isActive: true, priority: true },
    });
  }

  /** Storefront banner data: zone fees, free threshold, campaign flag and the note text. */
  async summary(now = new Date(), db: Db = this.prisma) {
    const [zones, rules] = await Promise.all([this.zones(db), this.activeRules(db)]);
    const live = rules.filter((r) => ruleIsLive(r, now));
    const mins = live.filter((r) => r.type === 'MIN_SUBTOTAL' && r.minSubtotal != null).map((r) => D(r.minSubtotal));
    const freeAbove = mins.length ? mins.reduce((a, b) => (b.lessThan(a) ? b : a)) : null;
    const campaign = live.find((r) => r.type === 'CAMPAIGN_ALL') ?? null;
    return {
      zones,
      freeAbove,
      campaign: campaign ? { label: campaign.label, endsAt: campaign.endsAt } : null,
      rules: live,
      note: shippingNote(zones, { freeAbove, campaign: !!campaign }),
    };
  }
}
