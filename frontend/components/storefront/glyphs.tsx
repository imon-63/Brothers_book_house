/* Small presentational SVG icons for the storefront redesign (stroke = currentColor). */

type P = { size?: number };

function S({ size = 20, children }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const GTruck = (p: P) => <S {...p}><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.7" /><circle cx="17.5" cy="18" r="1.7" /></S>;
export const GCash = (p: P) => <S {...p}><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v.01M18 14.5v.01" /></S>;
export const GShield = (p: P) => <S {...p}><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z" /><path d="m8.8 12.2 2.2 2.2 4.4-4.6" /></S>;
export const GHeadset = (p: P) => <S {...p}><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="13" width="4" height="6" rx="1.6" /><rect x="17" y="13" width="4" height="6" rx="1.6" /><path d="M19 19c0 1.5-2 2.5-5 2.5" /></S>;
export const GPhone = (p: P) => <S {...p}><path d="M7.2 3.8h2.6l1.2 3-1.7 1.2a12 12 0 0 0 5.7 5.7l1.2-1.7 3 1.2v2.6c0 .8-.7 1.5-1.5 1.5C9.8 17.3 6.7 8.2 6.7 5.3c0-.8.7-1.5 1.5-1.5z" /></S>;
export const GChat = (p: P) => <S {...p}><path d="M21 12a8.5 8.5 0 0 1-8.5 8.5H8l-4 3V12A8.5 8.5 0 1 1 21 12z" /><path d="M8.5 11h.01M12.5 11h.01M16.5 11h.01" /></S>;
export const GSearch = (p: P) => <S {...p}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></S>;
export const GArrow = (p: P) => <S {...p}><path d="M5 12h14M13 6l6 6-6 6" /></S>;
export const GChevron = (p: P) => <S {...p}><path d="m9 6 6 6-6 6" /></S>;
export const GClock = (p: P) => <S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></S>;
export const GBolt = (p: P) => <S {...p}><path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z" /></S>;
export const GGift = (p: P) => <S {...p}><rect x="3.5" y="9" width="17" height="11.5" rx="1.6" /><path d="M2.5 9h19M12 9v11.5" /><path d="M12 9S10.5 4 8 4.2C6 4.4 6.2 7.6 8.6 9M12 9s1.5-5 4-4.8c2 .2 1.8 3.4-.6 4.8" /></S>;
export const GBell = (p: P) => <S {...p}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></S>;
export const GHeart = (p: P) => <S {...p}><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" /></S>;
export const GBag = (p: P) => <S {...p}><path d="M5 8h14l-1.2 12.5H6.2z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></S>;
export const GBox = (p: P) => <S {...p}><path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z" /><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" /></S>;
export const GUser = (p: P) => <S {...p}><circle cx="12" cy="8" r="3.4" /><path d="M5 20c1.2-3.5 3.8-5.4 7-5.4s5.8 1.9 7 5.4" /></S>;
export const GMap = (p: P) => <S {...p}><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></S>;
export const GFilter = (p: P) => <S {...p}><path d="M4 6h16M7 12h10M10 18h4" /></S>;
export const GX = (p: P) => <S {...p}><path d="M6 6l12 12M18 6 6 18" /></S>;
export const GCheck = (p: P) => <S {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></S>;
export const GTicket = (p: P) => <S {...p}><path d="M4 8.5A2.5 2.5 0 0 0 6.5 6h11A2.5 2.5 0 0 0 20 8.5v1a2 2 0 0 1 0 5v1a2.5 2.5 0 0 0-2.5 2.5h-11A2.5 2.5 0 0 0 4 15.5v-1a2 2 0 0 1 0-5z" /><path d="M12 7v10" strokeDasharray="2 3" /></S>;
export const GBook = (p: P) => <S {...p}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5" /></S>;
export const GSpark = (p: P) => <S {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /></S>;
export const GWhatsapp = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M12.04 2C6.5 2 2 6.37 2 11.76c0 1.72.46 3.4 1.34 4.88L2 22l5.54-1.45A10.2 10.2 0 0 0 12.04 21.5C17.58 21.5 22.1 17.13 22.1 11.74 22.08 6.37 17.56 2 12.04 2zm5.02 13.8c-.21.58-1.24 1.12-1.7 1.16-.44.05-.99.07-1.6-.1a14.6 14.6 0 0 1-1.44-.52c-2.54-1.07-4.2-3.57-4.32-3.73-.13-.17-1.03-1.34-1.03-2.56 0-1.22.65-1.82.88-2.07.23-.25.5-.31.67-.31h.48c.15 0 .36-.06.56.42.21.5.71 1.7.77 1.82.06.13.1.27.02.44-.08.17-.13.27-.25.42-.13.15-.27.33-.38.44-.13.13-.26.26-.11.51.15.25.66 1.07 1.41 1.73.97.85 1.79 1.11 2.04 1.24.25.13.4.1.54-.06.15-.17.63-.72.8-.97.17-.25.33-.21.56-.13.23.08 1.46.67 1.71.8.25.13.42.19.48.29.06.1.06.6-.15 1.18z" />
  </svg>
);

/** Five-star rating (fractional fill), with a visually-hidden text label. */
export function Stars({ value, count, size = 13 }: { value: number; count?: number; size?: number }) {
  const v = Math.max(0, Math.min(5, value || 0));
  const pct = (v / 5) * 100;
  const label = `৫-এর মধ্যে ${toBn(v.toFixed(1))} রেটিং`;
  return (
    <span className="sf-stars" role="img" aria-label={count ? `${label} · ${toBn(count)}টি রিভিউ` : label} style={{ fontSize: size }}>
      <span className="sf-stars-base" aria-hidden="true">★★★★★</span>
      <span className="sf-stars-fill" aria-hidden="true" style={{ width: `${pct}%` }}>★★★★★</span>
    </span>
  );
}

function toBn(n: number | string) {
  return String(n).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)] ?? d);
}
