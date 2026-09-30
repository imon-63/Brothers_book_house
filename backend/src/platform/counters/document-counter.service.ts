import { Injectable } from '@nestjs/common';
import type { Tx } from '@/infrastructure/prisma/prisma.service';
import { padNo } from '@/common/utils/text';

export type CounterScope = 'order' | 'invoice' | 'receipt' | 'credit_note' | 'purchase';

const DEFAULTS: Record<CounterScope, { prefix: string; start: number; padding: number }> = {
  order: { prefix: 'CLO-', start: 2042, padding: 4 },
  invoice: { prefix: 'INV-', start: 1, padding: 6 },
  receipt: { prefix: 'RCT-', start: 1, padding: 6 },
  credit_note: { prefix: 'CRN-', start: 1, padding: 6 },
  purchase: { prefix: 'PUR-', start: 101, padding: 6 },
};

/**
 * Gapless, race-free human numbers (CLO-2042, INV-000001…).
 * Must run inside the caller's transaction: the row lock is held until commit,
 * so a rolled-back order never burns a number.
 */
@Injectable()
export class DocumentCounterService {
  async next(tx: Tx, scope: CounterScope): Promise<string> {
    const d = DEFAULTS[scope];
    // upsert-then-lock keeps the first call in a fresh DB safe too
    await tx.$executeRaw`
      INSERT INTO document_counters (scope, prefix, next_value, padding, updated_at)
      VALUES (${scope}, ${d.prefix}, ${d.start}, ${d.padding}, now())
      ON CONFLICT (scope) DO NOTHING`;
    const rows = await tx.$queryRaw<{ prefix: string; next_value: bigint; padding: number }[]>`
      UPDATE document_counters
         SET next_value = next_value + 1, updated_at = now()
       WHERE scope = ${scope}
   RETURNING prefix, next_value - 1 AS next_value, padding`;
    const row = rows[0];
    return padNo(row.prefix, row.next_value, row.padding);
  }
}
