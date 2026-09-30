import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/** Transaction client handed to repositories/services inside `prisma.tx(...)`. */
export type Tx = Prisma.TransactionClient;
/** Either the root client or a transaction — lets services join a caller's tx. */
export type Db = PrismaClient | Tx;

@Injectable()
export class PrismaService extends PrismaClient<Prisma.PrismaClientOptions, 'warn' | 'error'> implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Prisma');

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
      transactionOptions: { maxWait: 5_000, timeout: 15_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    });
    this.$on('warn', (e) => this.logger.warn(e.message));
    this.$on('error', (e) => this.logger.error(e.message));
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Run a unit of work atomically. Pass `serializable` for money/stock flows
   * that must not interleave (Prisma retries are the caller's job — see
   * `withRetry` in common/utils).
   */
  tx<T>(fn: (tx: Tx) => Promise<T>, opts?: { serializable?: boolean; timeoutMs?: number }): Promise<T> {
    return this.$transaction(fn, {
      isolationLevel: opts?.serializable ? Prisma.TransactionIsolationLevel.Serializable : Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: opts?.timeoutMs ?? 15_000,
    });
  }
}
