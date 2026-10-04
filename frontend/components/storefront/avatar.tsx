const TONES = ["#7A2430", "#3D5A4C", "#8A6230", "#5C1B24", "#245A6B", "#6B3A52"];

/** First visible letter (grapheme-safe for Bangla conjuncts / vowel signs). */
export function initialOf(name: string) {
  const t = (name || "").trim();
  if (!t) return "চ";
  try {
    const seg = new Intl.Segmenter("bn", { granularity: "grapheme" });
    const first = seg.segment(t)[Symbol.iterator]().next().value;
    if (first?.segment) return first.segment;
  } catch { /* old engines */ }
  return t.slice(0, 1);
}

export function toneOf(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

export function Avatar({ name, photo, size = 72, className = "" }: { name: string; photo?: string | null; size?: number; className?: string }) {
  const tone = toneOf(name);
  return (
    <span
      className={`sf-av${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), ["--c" as string]: tone }}
      aria-hidden="true"
    >
      {photo ? <img src={photo} alt="" /> : initialOf(name)}
    </span>
  );
}
