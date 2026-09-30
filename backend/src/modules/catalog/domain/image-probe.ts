export type ImageInfo = { mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; ext: string; width: number | null; height: number | null };

/**
 * Identify an image by its magic bytes (never trust the client's
 * Content-Type) and read its pixel size from the header when cheap.
 * Returns null for anything that is not a supported raster image.
 */
export function probeImage(buf: Buffer): ImageInfo | null {
  if (buf.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A, IHDR width/height at 16/20
  if (buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) {
    const ok = buf.length >= 24;
    return { mime: 'image/png', ext: 'png', width: ok ? buf.readUInt32BE(16) : null, height: ok ? buf.readUInt32BE(20) : null };
  }

  // GIF87a / GIF89a: logical screen size little-endian at 6/8
  const head6 = buf.subarray(0, 6).toString('ascii');
  if (head6 === 'GIF87a' || head6 === 'GIF89a') {
    return { mime: 'image/gif', ext: 'gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  // WebP: RIFF....WEBP + VP8 / VP8L / VP8X chunk
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp', ...webpSize(buf) };
  }

  // JPEG: FF D8 FF, size in the first SOFn segment
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg', ...jpegSize(buf) };
  }

  return null;
}

function webpSize(buf: Buffer): { width: number | null; height: number | null } {
  if (buf.length < 30) return { width: null, height: null };
  const chunk = buf.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  return { width: null, height: null };
}

function jpegSize(buf: Buffer): { width: number | null; height: number | null } {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    if (len < 2) break;
    i += 2 + len;
  }
  return { width: null, height: null };
}
