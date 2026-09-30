import { probeImage } from './image-probe';

function png(w: number, h: number) {
  const b = Buffer.alloc(33);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(0x0d0a1a0a, 4);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

function gif(w: number, h: number) {
  const b = Buffer.alloc(16);
  b.write('GIF89a', 0, 'ascii');
  b.writeUInt16LE(w, 6);
  b.writeUInt16LE(h, 8);
  return b;
}

function jpeg(w: number, h: number) {
  // SOI, APP0 (len 16), SOF0 (len 17)
  const app0 = Buffer.concat([Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14)]);
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(h, 5);
  sof.writeUInt16BE(w, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(8)]);
}

function webpVp8x(w: number, h: number) {
  const b = Buffer.alloc(32);
  b.write('RIFF', 0, 'ascii');
  b.write('WEBP', 8, 'ascii');
  b.write('VP8X', 12, 'ascii');
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
}

describe('probeImage', () => {
  it('detects PNG and reads its size', () => {
    expect(probeImage(png(800, 600))).toEqual({ mime: 'image/png', ext: 'png', width: 800, height: 600 });
  });
  it('detects GIF', () => {
    expect(probeImage(gif(40, 30))).toMatchObject({ mime: 'image/gif', width: 40, height: 30 });
  });
  it('detects JPEG and walks segments to SOF', () => {
    expect(probeImage(jpeg(1200, 900))).toMatchObject({ mime: 'image/jpeg', ext: 'jpg', width: 1200, height: 900 });
  });
  it('detects WebP (VP8X)', () => {
    expect(probeImage(webpVp8x(512, 256))).toMatchObject({ mime: 'image/webp', width: 512, height: 256 });
  });
  it('rejects non-images whatever their name says', () => {
    expect(probeImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(probeImage(Buffer.from('%PDF-1.7 ....'))).toBeNull();
    expect(probeImage(Buffer.alloc(4))).toBeNull();
  });
});
