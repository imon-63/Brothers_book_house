import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { skipTake, toPage } from '@/common/dto/pagination.dto';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { probeImage } from '../../domain/image-probe';
import { toMediaView } from '../../mappers/media.mapper';
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, type MediaQueryDto } from '../dto/media.dto';
import { StorageDriver } from '../storage/storage.driver';

export type UploadedImage = { buffer: Buffer; size: number; mimetype: string; originalname: string };

/** Image uploads → object storage + MediaAsset row. */
@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageDriver,
    private readonly audit: AuditService,
  ) {}

  @Traced('catalog.media.upload')
  async upload(file: UploadedImage | undefined, alt: string | undefined, actor: AuthUser) {
    if (!file?.buffer?.length) throw new BusinessRuleError('media.file_required', 'একটি ছবি দিন');
    if (file.size > MAX_UPLOAD_BYTES) throw new BusinessRuleError('media.too_large', 'ছবি ৫ MB এর বেশি হতে পারবে না');
    // trust the bytes, not the client's Content-Type
    const info = probeImage(file.buffer);
    if (!info || !(ALLOWED_MIME as readonly string[]).includes(info.mime)) {
      throw new BusinessRuleError('media.unsupported_type', 'শুধু JPG, PNG, WebP বা GIF ছবি দেওয়া যাবে');
    }
    const now = new Date();
    const key = `media/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${info.ext}`;
    const { url } = await this.storage.put(key, file.buffer, info.mime);
    try {
      const asset = await this.prisma.tx(async (tx) => {
        const m = await tx.mediaAsset.create({
          data: { storageKey: key, url, mimeType: info.mime, sizeBytes: file.size, width: info.width, height: info.height, alt: alt ?? null, uploadedById: actor.id },
        });
        await this.audit.record(
          { actor, action: 'CREATE', area: 'product', entityType: 'MediaAsset', entityId: m.id, summary: `ছবি আপলোড · ${Math.round(file.size / 1024)} KB`, after: { key, mime: info.mime } },
          tx,
        );
        return m;
      });
      return toMediaView(asset);
    } catch (err) {
      await this.storage.delete(key); // don't leave orphan files behind
      throw err;
    }
  }

  async list(q: MediaQueryDto) {
    const where = q.q ? { alt: { contains: q.q, mode: 'insensitive' as const } } : {};
    const [items, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({ where, orderBy: { createdAt: q.order === 'asc' ? 'asc' : 'desc' }, ...skipTake(q) }),
      this.prisma.mediaAsset.count({ where }),
    ]);
    return toPage(items.map(toMediaView), total, q);
  }

  /** Only unused media can be deleted (product images restrict; other links are cleared). */
  @Traced('catalog.media.delete')
  async remove(id: string, actor: AuthUser) {
    const m = await this.prisma.tx(async (tx) => {
      const asset = await tx.mediaAsset.findUnique({ where: { id }, include: { _count: { select: { productImages: true } } } });
      if (!asset) throw new NotFoundError('MediaAsset', id);
      if (asset._count.productImages > 0) {
        throw new ConflictError('media.in_use', `ছবিটি ${asset._count.productImages}টি পণ্যে ব্যবহার হচ্ছে — আগে সরান`, { productCount: asset._count.productImages });
      }
      await tx.mediaAsset.delete({ where: { id } });
      await this.audit.record({ actor, action: 'DELETE', area: 'product', entityType: 'MediaAsset', entityId: id, summary: 'ছবি মুছে ফেলা হয়েছে', before: { key: asset.storageKey } }, tx);
      return asset;
    });
    await this.storage.delete(m.storageKey);
    return { ok: true };
  }
}
