export function bn(n: number | string) {
  return String(n).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)] ?? d);
}

export function discount(price: number, old: number) {
  if (!old || old <= price) return 0;
  return Math.round((1 - price / old) * 100);
}

export function inStock(stock: number) {
  return stock > 0;
}

export function stars(n: number) {
  const f = Math.max(0, Math.min(5, Math.round(n || 0)));
  return "★".repeat(f) + "☆".repeat(5 - f);
}

export function timeAgo(ts: number) {
  const d = Math.max(0, Date.now() - (ts || 0));
  const m = Math.floor(d / 60000);
  if (m < 60) return bn(Math.max(1, m)) + " মিনিট আগে";
  const h = Math.floor(m / 60);
  if (h < 24) return bn(h) + " ঘণ্টা আগে";
  const days = Math.floor(h / 24);
  if (days < 30) return bn(days) + " দিন আগে";
  return bn(Math.max(1, Math.floor(days / 30))) + " মাস আগে";
}
