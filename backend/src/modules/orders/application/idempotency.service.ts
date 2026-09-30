import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessRuleError, ConflictError, DomainError } from '@/common/errors/domain.error';
import { PrismaService, type Tx } from '@/infrastructure/prisma/prisma.service';
import { hashRequest, isValidIdempotencyKey } from '../domain/idempotency';

const TTL_MS = 24 * 3_600_000;

export type Replay = { replayed: true; code: number; body: unknown };

/**
 * Makes POST /orders safe to retry. The key row is inserted INSIDE the order
 * transaction, so a failed attempt leaves nothing behind and a concurrent
 * duplicate waits on the unique index and then reads the committed response.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  prepare(scope: string, key: string | undefined, caller: string, body: unknown) {
    if (!isValidIdempotencyKey(key)) {
      throw new DomainError('idempotency.key_required', 'Idempotency-Key হেডার দিন (৮–৮০ অক্ষর)', HttpStatus.BAD_REQUEST);
    }
    return { scope, key, hash: hashRequest(scope, caller, body) };
  }

  /** Stored response for this key, or null. Different body with the same key → 422. */
  async lookup(p: { scope: string; key: string; hash: string }): Promise<Replay | null> {
    const row = await this.prisma.idempotencyKey.findUnique({ where: { key: p.key } });
    if (!row || row.expiresAt < new Date()) return null;
    if (row.scope !== p.scope || row.requestHash !== p.hash) {
      throw new BusinessRuleError('idempotency.key_reused', 'এই Idempotency-Key অন্য অনুরোধে ব্যবহার হয়েছে');
    }
    if (row.responseCode == null) throw new ConflictError('idempotency.in_progress', 'অর্ডারটি প্রক্রিয়াধীন — একটু পরে আবার দেখুন');
    return { replayed: true, code: row.responseCode, body: row.responseBody };
  }

  /** Claim the key inside the business transaction (expired leftovers are replaced). */
  async claim(tx: Tx, p: { scope: string; key: string; hash: string }) {
    await tx.idempotencyKey.deleteMany({ where: { key: p.key, expiresAt: { lt: new Date() } } });
    await tx.idempotencyKey.create({ data: { key: p.key, scope: p.scope, requestHash: p.hash, expiresAt: new Date(Date.now() + TTL_MS) } });
  }

  async complete(tx: Tx, key: string, code: number, body: unknown) {
    await tx.idempotencyKey.update({ where: { key }, data: { responseCode: code, responseBody: body as Prisma.InputJsonValue } });
  }

  static isKeyCollision(err: unknown) {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && String(err.meta?.target ?? '').includes('key');
  }
}
