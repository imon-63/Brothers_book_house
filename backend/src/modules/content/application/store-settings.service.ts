import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { AuditService } from '@/platform/audit/audit.service';
import { parseSetting, resolveSettings, SETTING_KEYS, SETTINGS, type SettingKey } from '../domain/store-settings';

/**
 * Typed store settings. Exported so other modules read config through this
 * service (e.g. `get('default_low_stock_threshold')`) instead of the table.
 * A tiny in-process cache (10s) keeps hot paths (storefront, reports) cheap.
 */
@Injectable()
export class StoreSettingsService {
  private cache: { at: number; values: Record<string, unknown> } | null = null;
  private static readonly TTL_MS = 10_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async all(): Promise<Record<string, unknown>> {
    if (this.cache && Date.now() - this.cache.at < StoreSettingsService.TTL_MS) return this.cache.values;
    const rows = await this.prisma.storeSetting.findMany({ where: { key: { in: SETTING_KEYS } } });
    const values = resolveSettings(rows);
    this.cache = { at: Date.now(), values };
    return values;
  }

  async get<K extends SettingKey>(key: K): Promise<(typeof SETTINGS)[K]['default'] | unknown> {
    return (await this.all())[key];
  }

  async publicSubset() {
    const all = await this.all();
    return Object.fromEntries(SETTING_KEYS.filter((k) => SETTINGS[k].public).map((k) => [k, all[k]]));
  }

  /** Admin view: value, default, description and visibility per key. */
  async describe() {
    const [values, rows] = await Promise.all([this.all(), this.prisma.storeSetting.findMany({ where: { key: { in: SETTING_KEYS } } })]);
    return SETTING_KEYS.map((k) => {
      const row = rows.find((r) => r.key === k);
      return { key: k, value: values[k], default: SETTINGS[k].default, isDefault: !row, public: SETTINGS[k].public, description: SETTINGS[k].description, updatedAt: row?.updatedAt ?? null };
    });
  }

  async setMany(actor: AuthUser, input: Record<string, unknown>) {
    const entries = Object.entries(input);
    if (!entries.length) throw new BusinessRuleError('settings.empty', 'কোনো সেটিং পাঠানো হয়নি');
    const parsed: [string, unknown][] = [];
    const errors: Record<string, string> = {};
    for (const [k, v] of entries) {
      const r = parseSetting(k, v);
      if (r.ok) parsed.push([k, r.value]);
      else errors[k] = r.error;
    }
    if (Object.keys(errors).length) throw new BusinessRuleError('settings.invalid', 'কিছু সেটিং সঠিক নয়', { errors });

    const before = await this.all();
    await this.prisma.tx(async (tx) => {
      for (const [key, value] of parsed) {
        const json = value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
        await tx.storeSetting.upsert({
          where: { key },
          create: { key, value: json, description: SETTINGS[key as SettingKey].description, updatedById: actor.id },
          update: { value: json, updatedById: actor.id },
        });
      }
      await this.audit.record({
        actor, action: 'UPDATE', area: 'settings', entityType: 'store_setting', entityId: parsed.map(([k]) => k).join(',').slice(0, 80),
        summary: `স্টোর সেটিং বদলানো: ${parsed.map(([k]) => k).join(', ')}`,
        before: Object.fromEntries(parsed.map(([k]) => [k, (before[k] ?? null) as Prisma.InputJsonValue])),
        after: Object.fromEntries(parsed.map(([k, v]) => [k, (v ?? null) as Prisma.InputJsonValue])),
      }, tx);
    });
    this.cache = null;
    return this.describe();
  }
}
