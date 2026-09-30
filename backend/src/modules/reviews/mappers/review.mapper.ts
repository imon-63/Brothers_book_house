import type { Prisma } from '@prisma/client';

export const reviewInclude = {
  images: { orderBy: { sortOrder: 'asc' }, select: { media: { select: { url: true, alt: true } } } },
} as const;

type ReviewRow = Prisma.ProductReviewGetPayload<{ include: typeof reviewInclude }>;

export function mapPublicReview(r: ReviewRow) {
  return {
    id: r.id,
    displayName: r.displayName,
    rating: r.rating,
    title: r.title,
    body: r.body,
    verified: !!r.orderItemId,
    helpfulCount: r.helpfulCount,
    images: r.images.map((i) => ({ url: i.media.url, alt: i.media.alt })),
    staffReply: r.staffReply,
    createdAt: r.createdAt,
  };
}

export const adminReviewInclude = {
  ...reviewInclude,
  product: { select: { id: true, title: true, slug: true } },
  customer: { select: { id: true, name: true, phone: true } },
  order: { select: { id: true, orderNo: true } },
  moderatedBy: { select: { id: true, name: true } },
} as const;

type AdminReviewRow = Prisma.ProductReviewGetPayload<{ include: typeof adminReviewInclude }>;

export function mapAdminReview(r: AdminReviewRow) {
  return {
    ...mapPublicReview(r),
    status: r.status,
    product: r.product,
    customer: r.customer,
    order: r.order,
    moderatedBy: r.moderatedBy,
    moderatedAt: r.moderatedAt,
    updatedAt: r.updatedAt,
  };
}
