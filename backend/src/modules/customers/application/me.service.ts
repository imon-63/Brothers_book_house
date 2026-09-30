import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { toNumber } from '@/common/utils/money';
import { normalizeBdPhone } from '@/common/utils/text';
import { PrismaService, type Db, type Tx } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import type { AddressDto, ChangePhoneDto, UpdateAddressDto, UpdateProfileDto } from '../dto/me.dto';
import { addressInclude, mapAddress } from '../mappers/customer.mapper';

const MAX_ADDRESSES = 10;

/** Customer self-service: profile and address book (/api/v1/me). */
@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  /** The CRM row behind the logged-in account (JWT claim first, then by user id). */
  async customerId(user: AuthUser, db: Db = this.prisma): Promise<string> {
    if (user.customerId) return user.customerId;
    const c = await db.customer.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!c) throw new NotFoundError('Customer');
    return c.id;
  }

  async profile(user: AuthUser) {
    const id = await this.customerId(user);
    const c = await this.prisma.customer.findUniqueOrThrow({
      where: { id },
      include: { user: { select: { email: true, phone: true, phoneVerified: true, emailVerified: true, createdAt: true } } },
    });
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.user?.email ?? c.email,
      phoneVerified: !!c.user?.phoneVerified,
      emailVerified: !!c.user?.emailVerified,
      marketingOptIn: c.marketingOptIn,
      memberSince: c.user?.createdAt ?? c.createdAt,
      stats: { ordersCount: c.ordersCount, liveOrders: c.liveOrders, totalSpent: toNumber(c.totalSpent), lastOrderAt: c.lastOrderAt },
    };
  }

  @Traced('me.update_profile')
  async updateProfile(user: AuthUser, dto: UpdateProfileDto) {
    const id = await this.customerId(user);
    const email = dto.email === undefined ? undefined : dto.email?.trim().toLowerCase() || null;
    if (email) {
      const clash = await this.prisma.user.findFirst({ where: { email, NOT: { id: user.id } }, select: { id: true } });
      if (clash) throw new ConflictError('profile.email_taken', 'এই ইমেইল অন্য অ্যাকাউন্টে ব্যবহৃত');
    }
    const name = dto.name?.trim();
    await this.prisma.tx(async (tx) => {
      await tx.customer.update({ where: { id }, data: { name, email, marketingOptIn: dto.marketingOptIn } });
      const userPatch: Prisma.UserUpdateInput = { name };
      if (email !== undefined) {
        const u = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true, phone: true } });
        if (!email && !u.phone) throw new BusinessRuleError('profile.login_required', 'লগইনের জন্য ইমেইল বা মোবাইল একটি থাকতেই হবে');
        if (email !== u.email) Object.assign(userPatch, { email, emailVerified: null });
      }
      await tx.user.update({ where: { id: user.id }, data: userPatch });
    });
    return this.profile(user);
  }

  /**
   * Changing the phone moves the CRM identity (customers.phone is unique) and
   * the login, so it must be proven with an OTP to the NEW number.
   * TODO(auth): send PHONE_VERIFY code via AuthService/outbox, verify `code`,
   * then update users.phone + customers.phone (merge guest history) in one tx.
   */
  async changePhone(_user: AuthUser, dto: ChangePhoneDto): Promise<never> {
    if (!normalizeBdPhone(dto.phone)) throw new BusinessRuleError('auth.phone_invalid', 'সঠিক মোবাইল নম্বর দিন');
    throw new BusinessRuleError('profile.phone_change_unavailable', 'মোবাইল নম্বর বদলাতে OTP যাচাই লাগবে — এই সুবিধা শিগগিরই আসছে। হেল্পলাইনে যোগাযোগ করুন।');
  }

  // ─── addresses ───

  async addresses(user: AuthUser) {
    const id = await this.customerId(user);
    const rows = await this.prisma.customerAddress.findMany({
      where: { customerId: id, deletedAt: null },
      include: addressInclude,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(mapAddress);
  }

  @Traced('me.add_address')
  async addAddress(user: AuthUser, dto: AddressDto) {
    const customerId = await this.customerId(user);
    const phone = this.phone(dto.phone);
    await this.checkDistrict(dto.districtId);
    const row = await this.prisma.tx(async (tx) => {
      const count = await tx.customerAddress.count({ where: { customerId, deletedAt: null } });
      if (count >= MAX_ADDRESSES) throw new BusinessRuleError('address.limit', `সর্বোচ্চ ${MAX_ADDRESSES}টি ঠিকানা রাখা যায়`);
      const makeDefault = dto.isDefault || count === 0;
      if (makeDefault) await this.clearDefault(tx, customerId);
      return tx.customerAddress.create({
        data: {
          customerId, phone, isDefault: makeDefault,
          label: dto.label?.trim() || null, recipientName: dto.recipientName.trim(), districtId: dto.districtId,
          upazila: dto.upazila?.trim() || null, union: dto.union?.trim() || null, line: dto.line.trim(),
          landmark: dto.landmark?.trim() || null, postcode: dto.postcode?.trim() || null,
        },
        include: addressInclude,
      });
    });
    return mapAddress(row);
  }

  async updateAddress(user: AuthUser, addressId: string, dto: UpdateAddressDto) {
    const customerId = await this.customerId(user);
    if (dto.districtId) await this.checkDistrict(dto.districtId);
    const row = await this.prisma.tx(async (tx) => {
      await this.mustOwn(tx, customerId, addressId);
      if (dto.isDefault) await this.clearDefault(tx, customerId);
      return tx.customerAddress.update({
        where: { id: addressId },
        data: {
          label: dto.label?.trim(), recipientName: dto.recipientName?.trim(), phone: dto.phone ? this.phone(dto.phone) : undefined,
          districtId: dto.districtId, upazila: dto.upazila?.trim(), union: dto.union?.trim(), line: dto.line?.trim(),
          landmark: dto.landmark?.trim(), postcode: dto.postcode?.trim(), isDefault: dto.isDefault ? true : undefined,
        },
        include: addressInclude,
      });
    });
    return mapAddress(row);
  }

  async setDefault(user: AuthUser, addressId: string) {
    return this.updateAddress(user, addressId, { isDefault: true });
  }

  /** Soft delete; if it was the default, the newest remaining address takes over. */
  async deleteAddress(user: AuthUser, addressId: string) {
    const customerId = await this.customerId(user);
    await this.prisma.tx(async (tx) => {
      const a = await this.mustOwn(tx, customerId, addressId);
      await tx.customerAddress.update({ where: { id: addressId }, data: { deletedAt: new Date(), isDefault: false } });
      if (a.isDefault) {
        const next = await tx.customerAddress.findFirst({ where: { customerId, deletedAt: null }, orderBy: { createdAt: 'desc' } });
        if (next) await tx.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
  }

  private phone(input: string) {
    const p = normalizeBdPhone(input);
    if (!p) throw new BusinessRuleError('address.phone_invalid', 'সঠিক মোবাইল নম্বর দিন');
    return p;
  }

  private async checkDistrict(id: number) {
    const d = await this.prisma.geoDistrict.findUnique({ where: { id }, select: { id: true } });
    if (!d) throw new BusinessRuleError('address.district_invalid', 'জেলা সঠিক নয়');
  }

  private async mustOwn(tx: Tx, customerId: string, id: string) {
    const a = await tx.customerAddress.findFirst({ where: { id, customerId, deletedAt: null } });
    if (!a) throw new NotFoundError('Address', id);
    return a;
  }

  /** One default per customer (partial unique index) — clear before setting. */
  private clearDefault(tx: Tx, customerId: string) {
    return tx.customerAddress.updateMany({ where: { customerId, isDefault: true, deletedAt: null }, data: { isDefault: false } });
  }
}
