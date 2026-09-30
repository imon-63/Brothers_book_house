import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, type Db } from '@/infrastructure/prisma/prisma.service';
import { pickUniqueSlug, slugBase } from '../domain/slug';

/** Tables whose `slug` is globally unique. Whitelisted: the name is spliced into SQL. */
const GLOBAL_TABLES = {
  product: { table: 'products', max: 200 },
  bundle: { table: 'bundles', max: 200 },
  author: { table: 'authors', max: 160 },
  publisher: { table: 'publishers', max: 160 },
  brand: { table: 'brands', max: 160 },
} as const;

export type SlugScope = keyof typeof GLOBAL_TABLES;

/**
 * Human-readable, unique slugs ("নবম-দশম-পদার্থবিজ্ঞান", "…-2").
 * Run inside the creating transaction; the unique index is the final guard
 * (callers retry once on P2002).
 */
@Injectable()
export class SlugService {
  constructor(private readonly prisma: PrismaService) {}

  async unique(scope: SlugScope, source: string, opts: { db?: Db; excludeId?: string; fallback?: string } = {}): Promise<string> {
    const { table, max } = GLOBAL_TABLES[scope];
    const base = slugBase(source, opts.fallback ?? scope, max - 4);
    const db = opts.db ?? this.prisma;
    const rows = await db.$queryRaw<{ slug: string }[]>`
      SELECT slug FROM ${Prisma.raw(table)}
       WHERE (slug = ${base} OR slug LIKE ${`${base}-%`})
         ${opts.excludeId ? Prisma.sql`AND id <> ${opts.excludeId}::uuid` : Prisma.empty}`;
    return pickUniqueSlug(base, rows.map((r) => r.slug), max);
  }

  /** Category slugs are unique per section. */
  async uniqueCategory(sectionId: string, source: string, opts: { db?: Db; excludeId?: string } = {}): Promise<string> {
    const base = slugBase(source, 'category', 110);
    const db = opts.db ?? this.prisma;
    const rows = await db.$queryRaw<{ slug: string }[]>`
      SELECT slug FROM categories
       WHERE section_id = ${sectionId}::uuid
         AND (slug = ${base} OR slug LIKE ${`${base}-%`})
         ${opts.excludeId ? Prisma.sql`AND id <> ${opts.excludeId}::uuid` : Prisma.empty}`;
    return pickUniqueSlug(base, rows.map((r) => r.slug), 120);
  }
}
