import { applyDecorators, Header } from '@nestjs/common';

/** Storefront reads are identical for every visitor → let the CDN/browser cache them briefly. */
export const PublicCache = (maxAge = 60) =>
  applyDecorators(Header('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 5}`), Header('Vary', 'Accept-Encoding'));
