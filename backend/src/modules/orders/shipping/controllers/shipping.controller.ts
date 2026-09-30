import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/auth.decorators';
import { toNumber } from '@/common/utils/money';
import { GeoService } from '../../geo/application/geo.service';
import { ShippingLookupService } from '../application/shipping-lookup.service';
import { resolveShipping } from '../domain/shipping-fee';
import { ShippingQuoteQueryDto } from '../dto/shipping.dto';

@ApiTags('Shipping · ডেলিভারি')
@Public()
@Controller({ path: 'shipping', version: '1' })
export class ShippingController {
  constructor(
    private readonly lookup: ShippingLookupService,
    private readonly geo: GeoService,
  ) {}

  @Get('zones')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'Delivery zones, free-delivery threshold/campaign and the checkout note' })
  async zones() {
    const s = await this.lookup.summary();
    return {
      zones: s.zones.map((z) => ({ code: z.code, nameBn: z.nameBn, fee: toNumber(z.fee), etaMinDays: z.etaMinDays, etaMaxDays: z.etaMaxDays })),
      freeAbove: s.freeAbove ? toNumber(s.freeAbove) : null,
      campaign: s.campaign,
      note: s.note,
    };
  }

  @Get('quote')
  @ApiOperation({ summary: 'Base delivery fee for a district (cart-independent; the cart quote applies free rules)' })
  async quote(@Query() q: ShippingQuoteQueryDto) {
    const d = await this.geo.resolveDistrict({ id: /^\d+$/.test(q.district) ? Number(q.district) : null, name: q.district });
    const s = await this.lookup.summary();
    const campaign = resolveShipping({ zone: d.zone, lines: [], netSubtotal: 0, rules: s.rules, now: new Date() });
    return {
      district: { id: d.id, nameBn: d.nameBn, division: d.division.nameBn },
      zone: { code: d.zone.code, nameBn: d.zone.nameBn, etaMinDays: d.zone.etaMinDays, etaMaxDays: d.zone.etaMaxDays },
      fee: toNumber(campaign.fee),
      baseFee: toNumber(d.zone.fee),
      reason: campaign.reason,
      freeAbove: s.freeAbove ? toNumber(s.freeAbove) : null,
      note: s.note,
    };
  }
}
