import type { Author, Brand, Publisher } from '@prisma/client';

export function toAuthorView(a: Author & { photo?: { url: string } | null }) {
  return { id: a.id, slug: a.slug, name: a.nameBn, nameEn: a.nameEn, bio: a.bio, photoUrl: a.photo?.url ?? null };
}

export function toAdminAuthorView(a: Author & { photo?: { url: string } | null; _count?: { products: number } }) {
  return {
    ...toAuthorView(a),
    nameBn: a.nameBn,
    photoId: a.photoId,
    productCount: a._count?.products ?? 0,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    deletedAt: a.deletedAt?.toISOString() ?? null,
  };
}

export function toLabelView(l: (Publisher | Brand) & { _count?: { products: number } }) {
  return { id: l.id, slug: l.slug, name: l.name, productCount: l._count?.products ?? 0, createdAt: l.createdAt.toISOString(), deletedAt: l.deletedAt?.toISOString() ?? null };
}
