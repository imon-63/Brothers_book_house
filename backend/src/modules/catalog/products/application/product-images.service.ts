import { Injectable } from '@nestjs/common';
import { BusinessRuleError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService, type Tx } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { toImage } from '../../mappers/product.mapper';
import { MediaService, type UploadedImage } from '../../media/application/media.service';

const MAX_IMAGES = 20;

/** Product gallery: attach, reorder, set cover, detach. One primary per product (partial unique index). */
@Injectable()
export class ProductImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  @Traced('catalog.images.upload_attach')
  async uploadAndAttach(productId: string, file: UploadedImage | undefined, alt: string | undefined, isPrimary: boolean, actor: AuthUser) {
    await this.product(this.prisma, productId);
    const m = await this.media.upload(file, alt, actor);
    return this.attach(productId, m.id, isPrimary, actor);
  }

  @Traced('catalog.images.attach')
  async attach(productId: string, mediaId: string, isPrimary: boolean | undefined, actor: AuthUser) {
    return this.prisma.tx(async (tx) => {
      const p = await this.product(tx, productId);
      if (!(await tx.mediaAsset.findUnique({ where: { id: mediaId }, select: { id: true } }))) throw new NotFoundError('MediaAsset', mediaId);
      const existing = await tx.productImage.findMany({ where: { productId }, orderBy: { sortOrder: 'asc' } });
      if (existing.some((i) => i.mediaId === mediaId)) return this.gallery(tx, productId);
      if (existing.length >= MAX_IMAGES) throw new BusinessRuleError('product.too_many_images', `একটি পণ্যে সর্বোচ্চ ${MAX_IMAGES}টি ছবি`);
      const primary = isPrimary || existing.length === 0;
      if (primary) await tx.productImage.updateMany({ where: { productId, isPrimary: true }, data: { isPrimary: false } });
      const sortOrder = (existing.at(-1)?.sortOrder ?? -1) + 1;
      await tx.productImage.create({ data: { productId, mediaId, sortOrder, isPrimary: primary } });
      await this.touch(tx, productId, actor, `«${p.title}» এ ছবি যোগ${primary ? ' (কভার)' : ''}`);
      return this.gallery(tx, productId);
    });
  }

  @Traced('catalog.images.reorder')
  async reorder(productId: string, mediaIds: string[], actor: AuthUser) {
    return this.prisma.tx(async (tx) => {
      const p = await this.product(tx, productId);
      const existing = await tx.productImage.findMany({ where: { productId } });
      const have = new Set(existing.map((i) => i.mediaId));
      if (mediaIds.length !== existing.length || !mediaIds.every((id) => have.has(id))) {
        throw new BusinessRuleError('product.images_mismatch', 'ছবির তালিকা মিলছে না — রিফ্রেশ করে আবার সাজান');
      }
      await Promise.all(mediaIds.map((mediaId, i) => tx.productImage.update({ where: { productId_mediaId: { productId, mediaId } }, data: { sortOrder: i } })));
      await this.touch(tx, productId, actor, `«${p.title}» এর ছবির ক্রম বদলানো হয়েছে`);
      return this.gallery(tx, productId);
    });
  }

  @Traced('catalog.images.set_primary')
  async setPrimary(productId: string, mediaId: string, actor: AuthUser) {
    return this.prisma.tx(async (tx) => {
      const p = await this.product(tx, productId);
      const img = await tx.productImage.findUnique({ where: { productId_mediaId: { productId, mediaId } } });
      if (!img) throw new NotFoundError('ProductImage', mediaId);
      if (!img.isPrimary) {
        await tx.productImage.updateMany({ where: { productId, isPrimary: true }, data: { isPrimary: false } });
        await tx.productImage.update({ where: { id: img.id }, data: { isPrimary: true } });
        await this.touch(tx, productId, actor, `«${p.title}» এর কভার ছবি বদলানো হয়েছে`);
      }
      return this.gallery(tx, productId);
    });
  }

  @Traced('catalog.images.detach')
  async detach(productId: string, mediaId: string, actor: AuthUser) {
    return this.prisma.tx(async (tx) => {
      const p = await this.product(tx, productId);
      const img = await tx.productImage.findUnique({ where: { productId_mediaId: { productId, mediaId } } });
      if (!img) throw new NotFoundError('ProductImage', mediaId);
      await tx.productImage.delete({ where: { id: img.id } });
      if (img.isPrimary) {
        const next = await tx.productImage.findFirst({ where: { productId }, orderBy: { sortOrder: 'asc' } });
        if (next) await tx.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
      await this.touch(tx, productId, actor, `«${p.title}» থেকে ছবি সরানো হয়েছে`);
      return this.gallery(tx, productId);
    });
  }

  private async product(db: Tx | PrismaService, id: string) {
    const p = await db.product.findFirst({ where: { id, deletedAt: null }, select: { id: true, title: true } });
    if (!p) throw new NotFoundError('Product', id);
    return p;
  }

  private async gallery(tx: Tx, productId: string) {
    const rows = await tx.productImage.findMany({
      where: { productId },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
      include: { media: { select: { id: true, url: true, alt: true, width: true, height: true, blurhash: true } } },
    });
    return rows.map(toImage);
  }

  private async touch(tx: Tx, productId: string, actor: AuthUser, summary: string) {
    await tx.product.update({ where: { id: productId }, data: { version: { increment: 1 } } });
    await this.audit.record({ actor, action: 'UPDATE', area: 'product', entityType: 'Product', entityId: productId, summary }, tx);
  }
}
