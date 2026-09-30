import { Injectable } from '@nestjs/common';
import { D } from '@/common/utils/money';
import { PrismaService, type Db } from '@/infrastructure/prisma/prisma.service';

export const GATEWAY_FEE_PCT_KEY = 'gateway_fee_pct';

/** Typed reads of store_settings used by the books. */
@Injectable()
export class FinanceSettings {
  constructor(private readonly prisma: PrismaService) {}

  /** SSLCOMMERZ fee % used when the real fee is not known yet (store setting, default 0). */
  async gatewayFeePct(db: Db = this.prisma) {
    const row = await db.storeSetting.findUnique({ where: { key: GATEWAY_FEE_PCT_KEY } });
    const raw = row?.value as unknown;
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : typeof raw === 'object' && raw && 'value' in raw ? Number((raw as { value: unknown }).value) : 0;
    return Number.isFinite(n) && n >= 0 && n <= 100 ? D(n) : D(0);
  }
}
