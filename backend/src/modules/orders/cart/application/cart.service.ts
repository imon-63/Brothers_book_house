import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'node:crypto';
import { BusinessRuleError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService, type Db } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { PricingService } from '../../pricing/application/pricing.service';
import { toQuoteResponse } from '../../pricing/mappers/quote.mapper';
import type { AddCartItemDto } from '../dto/cart.dto';

const GUEST_TTL_DAYS = 30;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export type CartOwner = { customerId: string; token?: undefined } | { customerId?: undefined; token: string };

type CartRow = {
  id: string;
  guestToken: string | null;
  couponCode: string | null;
  items: { id: string; productId: string | null; bundleId: string | null; quantity: number; addedAt: Date }[];
};

const CART_INCLUDE = { items: { orderBy: { addedAt: 'asc' as const }, select: { id: true, productId: true, bundleId: true, quantity: true, addedAt: true } } };

/**
 * Server-side cart. Logged-in customers own one cart; guests are identified
 * by an opaque token sent back in `x-cart-token`. Every read returns a live
 * quote from PricingService, so the cart and checkout can never disagree.
 */
@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  /** Customer cart when logged in as a shopper, otherwise the guest token (if any). */
  static owner(user: AuthUser | undefined, token: string | undefined): CartOwner | null {
    if (user?.customerId) return { customerId: user.customerId };
    if (token && TOKEN_RE.test(token)) return { token };
    return null;
  }

  async get(owner: CartOwner | null, district?: string) {
    const cart = owner ? await this.find(owner) : null;
    return this.view(cart, district);
  }

  /** Create (or return) the caller's cart; guests get a fresh token. */
  async ensure(owner: CartOwner | null): Promise<CartRow> {
    if (owner) {
      const found = await this.find(owner);
      if (found) return found;
    }
    if (owner?.customerId) return this.prisma.cart.create({ data: { customerId: owner.customerId }, include: CART_INCLUDE });
    return this.prisma.cart.create({ data: { guestToken: newToken(), expiresAt: expiry() }, include: CART_INCLUDE });
  }

  @Traced('cart.add')
  async add(owner: CartOwner | null, dto: AddCartItemDto) {
    const id = dto.kind === 'PRODUCT' ? dto.productId : dto.bundleId;
    if (!id) throw new BusinessRuleError('cart.line_invalid', dto.kind === 'PRODUCT' ? 'পণ্যের আইডি দিন' : 'প্যাকেজের আইডি দিন');
    const qty = dto.quantity ?? 1;
    const { unavailable } = await this.pricing.loadLines([{ kind: dto.kind, productId: dto.productId, bundleId: dto.bundleId, quantity: qty }], new Date());
    if (unavailable.length) throw new BusinessRuleError('cart.item_unavailable', 'পণ্যটি এখন বিক্রি হচ্ছে না', { reason: unavailable[0].reason });

    const cart = await this.ensure(owner);
    const existing = cart.items.find((i) => (dto.kind === 'PRODUCT' ? i.productId === id : i.bundleId === id));
    if (existing) {
      await this.prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: Math.min(99, existing.quantity + qty) } });
    } else {
      if (cart.items.length >= 50) throw new BusinessRuleError('cart.full', 'কার্টে সর্বোচ্চ ৫০টি আলাদা পণ্য রাখা যায়');
      await this.prisma.cartItem.create({ data: { cartId: cart.id, productId: dto.kind === 'PRODUCT' ? id : null, bundleId: dto.kind === 'BUNDLE' ? id : null, quantity: qty } });
    }
    return this.touchAndView(cart.id);
  }

  async setQuantity(owner: CartOwner | null, itemId: string, quantity: number) {
    const cart = await this.requireCart(owner);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundError('CartItem', itemId);
    if (quantity === 0) await this.prisma.cartItem.delete({ where: { id: itemId } });
    else await this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
    return this.touchAndView(cart.id);
  }

  async remove(owner: CartOwner | null, itemId: string) {
    return this.setQuantity(owner, itemId, 0);
  }

  async clear(owner: CartOwner | null) {
    const cart = owner ? await this.find(owner) : null;
    if (!cart) return this.view(null);
    await this.prisma.$transaction([this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } }), this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } })]);
    return this.touchAndView(cart.id);
  }

  /** Apply only when the coupon actually fits this cart (same rules as checkout). */
  @Traced('cart.coupon')
  async applyCoupon(owner: CartOwner | null, code: string) {
    const cart = await this.requireCart(owner);
    if (!cart.items.length) throw new BusinessRuleError('cart.empty', 'কার্ট খালি');
    const priced = await this.pricing.quote({ lines: toRefs(cart), couponCode: code, customerId: owner?.customerId ?? null });
    const bad = priced.quote.couponRejection;
    if (bad) throw new BusinessRuleError(bad.code, bad.message, bad.details);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: priced.quote.coupon?.code ?? code.trim().toUpperCase() } });
    return this.touchAndView(cart.id);
  }

  async removeCoupon(owner: CartOwner | null) {
    const cart = await this.requireCart(owner);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
    return this.touchAndView(cart.id);
  }

  /** After login: move the guest cart's lines into the customer's cart (quantities add up, max 99). */
  @Traced('cart.merge')
  async merge(customerId: string, guestToken: string) {
    const merged = await this.prisma.tx(async (tx) => {
      const guest = await tx.cart.findUnique({ where: { guestToken }, include: CART_INCLUDE });
      let mine = await tx.cart.findFirst({ where: { customerId, guestToken: null }, include: CART_INCLUDE, orderBy: { updatedAt: 'desc' } });
      if (!guest || guest.customerId === customerId) return mine?.id ?? null;
      if (!mine) mine = await tx.cart.create({ data: { customerId }, include: CART_INCLUDE });
      for (const g of guest.items) {
        const same = mine.items.find((m) => (g.productId ? m.productId === g.productId : m.bundleId === g.bundleId));
        if (same) await tx.cartItem.update({ where: { id: same.id }, data: { quantity: Math.min(99, same.quantity + g.quantity) } });
        else await tx.cartItem.create({ data: { cartId: mine.id, productId: g.productId, bundleId: g.bundleId, quantity: g.quantity, addedAt: g.addedAt } });
      }
      if (!mine.couponCode && guest.couponCode) await tx.cart.update({ where: { id: mine.id }, data: { couponCode: guest.couponCode } });
      await tx.cart.delete({ where: { id: guest.id } });
      return mine.id;
    });
    return merged ? this.touchAndView(merged) : this.view(null);
  }

  /** Empty the caller's cart after an order is placed (inside the order tx). */
  async clearForOrder(db: Db, owner: CartOwner | null) {
    if (!owner) return;
    const where = owner.customerId ? { customerId: owner.customerId } : { guestToken: owner.token };
    const carts = await db.cart.findMany({ where, select: { id: true } });
    if (!carts.length) return;
    await db.cartItem.deleteMany({ where: { cartId: { in: carts.map((c) => c.id) } } });
    await db.cart.updateMany({ where: { id: { in: carts.map((c) => c.id) } }, data: { couponCode: null } });
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeExpiredGuestCarts() {
    const { count } = await this.prisma.cart.deleteMany({ where: { customerId: null, expiresAt: { lt: new Date() } } });
    if (count) this.logger.log(`purged ${count} expired guest carts`);
  }

  // ─── internals ───

  private find(owner: CartOwner) {
    return owner.customerId
      ? this.prisma.cart.findFirst({ where: { customerId: owner.customerId }, include: CART_INCLUDE, orderBy: { updatedAt: 'desc' } })
      : this.prisma.cart.findFirst({ where: { guestToken: owner.token, customerId: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, include: CART_INCLUDE });
  }

  private async requireCart(owner: CartOwner | null) {
    const cart = owner ? await this.find(owner) : null;
    if (!cart) throw new NotFoundError('Cart');
    return cart;
  }

  private async touchAndView(cartId: string) {
    const cur = await this.prisma.cart.findUniqueOrThrow({ where: { id: cartId }, select: { guestToken: true } });
    const cart = await this.prisma.cart.update({
      where: { id: cartId },
      data: { updatedAt: new Date(), ...(cur.guestToken ? { expiresAt: expiry() } : {}) },
      include: CART_INCLUDE,
    });
    return this.view(cart);
  }

  private async view(cart: CartRow | null, district?: string) {
    if (!cart || !cart.items.length) {
      return { id: cart?.id ?? null, token: cart?.guestToken ?? null, items: [], couponCode: cart?.couponCode ?? null, count: 0, quote: null };
    }
    const districtRef = district ? (/^\d+$/.test(district) ? { id: Number(district) } : { name: district }) : null;
    const priced = await this.pricing.quote({ lines: toRefs(cart), couponCode: cart.couponCode, district: districtRef });
    const quote = toQuoteResponse(priced);
    const unavailable = new Set(priced.unavailable.map((u) => `${u.kind}:${u.id}`));
    const short = new Map(priced.shortfalls.map((s) => [s.productId, s]));
    return {
      id: cart.id,
      token: cart.guestToken,
      couponCode: cart.couponCode,
      count: cart.items.reduce((s, i) => s + i.quantity, 0),
      items: cart.items.map((i) => {
        const key = i.productId ? `PRODUCT:${i.productId}` : `BUNDLE:${i.bundleId}`;
        const line = quote.lines.find((l) => (i.productId ? l.productId === i.productId : l.bundleId === i.bundleId));
        const stockIssue = line ? [line.productId, ...line.components.map((c) => c.productId)].map((p) => (p ? short.get(p) : undefined)).find(Boolean) : undefined;
        return {
          id: i.id,
          kind: i.productId ? 'PRODUCT' : 'BUNDLE',
          productId: i.productId,
          bundleId: i.bundleId,
          quantity: i.quantity,
          addedAt: i.addedAt,
          available: !unavailable.has(key),
          stockOk: !stockIssue,
          maxAvailable: stockIssue?.available ?? null,
          line: line ?? null,
        };
      }),
      quote,
    };
  }
}

function toRefs(cart: CartRow) {
  return cart.items.map((i) => ({ kind: (i.productId ? 'PRODUCT' : 'BUNDLE') as 'PRODUCT' | 'BUNDLE', productId: i.productId, bundleId: i.bundleId, quantity: i.quantity }));
}

function newToken() {
  return randomBytes(24).toString('base64url');
}

function expiry() {
  return new Date(Date.now() + GUEST_TTL_DAYS * 86_400_000);
}
