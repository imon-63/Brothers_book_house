import { Injectable } from '@nestjs/common';
import { BusinessRuleError, NotFoundError } from '@/common/errors/domain.error';
import { PrismaService, type Db } from '@/infrastructure/prisma/prisma.service';

export type ResolvedDistrict = {
  id: number;
  nameBn: string;
  nameEn: string | null;
  division: { id: number; nameBn: string };
  zone: { id: number; code: string; nameBn: string; fee: string; courierCost: string; etaMinDays: number; etaMaxDays: number };
};

const TTL_MS = 10 * 60_000;

/**
 * বিভাগ → জেলা → উপজেলা → ইউনিয়ন reference data. It changes only with a
 * seed, so lists are cached in-process for a few minutes.
 */
@Injectable()
export class GeoService {
  private cache = new Map<string, { at: number; value: unknown }>();

  constructor(private readonly prisma: PrismaService) {}

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
    const value = await load();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  divisions() {
    return this.cached('div', () =>
      this.prisma.geoDivision.findMany({ orderBy: { id: 'asc' }, select: { id: true, nameBn: true, nameEn: true, _count: { select: { districts: true } } } }).then((rows) =>
        rows.map((r) => ({ id: r.id, nameBn: r.nameBn, nameEn: r.nameEn, districts: r._count.districts })),
      ),
    );
  }

  async districts(division?: string) {
    const divisionId = division ? (await this.resolveDivision(division)).id : undefined;
    return this.cached(`dist:${divisionId ?? '*'}`, async () => {
      const rows = await this.prisma.geoDistrict.findMany({
        where: divisionId ? { divisionId } : {},
        select: { id: true, nameBn: true, nameEn: true, divisionId: true, shippingZone: { select: { code: true } } },
      });
      return rows
        .map((r) => ({ id: r.id, nameBn: r.nameBn, nameEn: r.nameEn, divisionId: r.divisionId, zoneCode: r.shippingZone.code }))
        .sort((a, b) => a.nameBn.localeCompare(b.nameBn, 'bn'));
    });
  }

  async upazilas(district: string) {
    const d = await this.resolveDistrict({ name: district, id: toId(district) });
    return this.cached(`upa:${d.id}`, () =>
      this.prisma.geoUpazila.findMany({ where: { districtId: d.id }, orderBy: { nameBn: 'asc' }, select: { id: true, nameBn: true, nameEn: true } }),
    );
  }

  async unions(upazila: string) {
    const id = toId(upazila);
    const u = id
      ? await this.prisma.geoUpazila.findUnique({ where: { id }, select: { id: true } })
      : await this.prisma.geoUpazila.findFirst({ where: { nameBn: upazila }, select: { id: true } });
    if (!u) throw new NotFoundError('Upazila', upazila);
    return this.cached(`uni:${u.id}`, () =>
      this.prisma.geoUnion.findMany({ where: { upazilaId: u.id }, orderBy: { nameBn: 'asc' }, select: { id: true, nameBn: true, nameEn: true } }),
    );
  }

  async resolveDivision(v: string) {
    const id = toId(v);
    const row = id
      ? await this.prisma.geoDivision.findUnique({ where: { id } })
      : await this.prisma.geoDivision.findFirst({ where: { OR: [{ nameBn: v }, { nameEn: { equals: v, mode: 'insensitive' } }] } });
    if (!row) throw new NotFoundError('Division', v);
    return row;
  }

  /** District by id or Bangla/English name, with its division and shipping zone. */
  async resolveDistrict(q: { id?: number | null; name?: string | null }, db: Db = this.prisma): Promise<ResolvedDistrict> {
    const name = q.name?.trim();
    if (!q.id && !name) throw new BusinessRuleError('geo.district_required', 'জেলা বাছুন');
    const row = await db.geoDistrict.findFirst({
      where: q.id ? { id: q.id } : { OR: [{ nameBn: name }, { nameEn: { equals: name, mode: 'insensitive' } }] },
      include: { division: { select: { id: true, nameBn: true } }, shippingZone: true },
    });
    if (!row) throw new BusinessRuleError('geo.district_invalid', 'জেলা খুঁজে পাওয়া যায়নি', { district: q.id ?? name });
    const z = row.shippingZone;
    return {
      id: row.id,
      nameBn: row.nameBn,
      nameEn: row.nameEn,
      division: row.division,
      zone: { id: z.id, code: z.code, nameBn: z.nameBn, fee: z.fee.toString(), courierCost: z.courierCost.toString(), etaMinDays: z.etaMinDays, etaMaxDays: z.etaMaxDays },
    };
  }

  /**
   * Validate an optional upazila/union against the district. Unknown names are
   * rejected only when the district has upazilas seeded (so partial seeds still work).
   */
  async checkLocality(districtId: number, upazila: string | null | undefined, union: string | null | undefined, db: Db = this.prisma) {
    if (!upazila) return;
    const seeded = await db.geoUpazila.count({ where: { districtId } });
    if (!seeded) return;
    const u = await db.geoUpazila.findFirst({ where: { districtId, nameBn: upazila }, select: { id: true } });
    if (!u) throw new BusinessRuleError('geo.upazila_invalid', 'উপজেলা / থানা এই জেলার মধ্যে নেই', { upazila });
    if (!union) return;
    const unionsSeeded = await db.geoUnion.count({ where: { upazilaId: u.id } });
    if (unionsSeeded && !(await db.geoUnion.findFirst({ where: { upazilaId: u.id, nameBn: union }, select: { id: true } }))) {
      throw new BusinessRuleError('geo.union_invalid', 'ইউনিয়ন এই উপজেলার মধ্যে নেই', { union });
    }
  }
}

function toId(v: string): number | undefined {
  return /^\d+$/.test(v) ? Number(v) : undefined;
}
