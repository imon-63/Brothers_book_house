import type { MediaAsset } from '@prisma/client';

export function toMediaView(m: MediaAsset) {
  return {
    id: m.id,
    url: m.url,
    mimeType: m.mimeType,
    sizeBytes: m.sizeBytes,
    width: m.width,
    height: m.height,
    alt: m.alt,
    createdAt: m.createdAt.toISOString(),
  };
}
