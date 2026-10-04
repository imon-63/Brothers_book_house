/**
 * Product description = an intro paragraph + bullet points, stored as plain
 * text (no schema change): intro lines first, then one "• point" per line.
 * Old free-text descriptions parse as intro only; "-", "*", "✓", "•" all count
 * as bullets so pasted lists work too.
 */
export type DescParts = { intro: string; points: string[] };

const BULLET = /^\s*(?:[•\-*✓✔▪●]|\d+[.)])\s+/;

export function parseDesc(text: string | null | undefined): DescParts {
  const intro: string[] = [];
  const points: string[] = [];
  for (const raw of (text ?? "").replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    if (BULLET.test(line)) {
      const p = line.replace(BULLET, "").trim();
      if (p) points.push(p);
    } else if (line.trim()) {
      intro.push(line.trim());
    }
  }
  return { intro: intro.join("\n"), points };
}

export function joinDesc({ intro, points }: DescParts): string {
  const body = points.map((p) => p.trim()).filter(Boolean).map((p) => `• ${p}`);
  return [intro.trim(), ...body].filter(Boolean).join("\n");
}
