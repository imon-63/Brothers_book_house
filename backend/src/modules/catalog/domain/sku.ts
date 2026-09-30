const PREFIX: Record<string, string> = { book: 'BK', food: 'FD', gadget: 'GD' };

/**
 * Auto SKU when staff leave it blank: section prefix + time + random tail,
 * e.g. "BK-M1ZK3Q-7F2A". Time-ordered, short, and collision-safe enough that
 * the unique index + one retry covers the rest.
 */
export function generateSku(sectionCode: string, now = Date.now(), rand: () => number = Math.random): string {
  const prefix = PREFIX[sectionCode] ?? (sectionCode.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase() || 'PR');
  const time = now.toString(36).toUpperCase();
  const tail = Math.floor(rand() * 36 ** 4)
    .toString(36)
    .toUpperCase()
    .padStart(4, '0');
  return `${prefix}-${time}-${tail}`;
}
