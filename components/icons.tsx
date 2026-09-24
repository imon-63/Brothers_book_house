export function IconBook() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 4h11a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V6a2 2 0 0 1 2-2z" />
    </svg>
  );
}

export function IconFood() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 8h12l-1.2 12H7.2L6 8z" />
      <path d="M9 8V6.5A3 3 0 0 1 15 6.5V8" />
    </svg>
  );
}

export function IconGadget() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </svg>
  );
}

export function IconCart({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="9" cy="20" r="1.3" />
      <circle cx="18" cy="20" r="1.3" />
      <path d="M3 4h2l2.2 11h11.3l1.8-8H7" />
    </svg>
  );
}

const ICONS = { book: IconBook, food: IconFood, gadget: IconGadget };
export function VerticalIcon({ id }: { id: "book" | "food" | "gadget" }) {
  const Ico = ICONS[id];
  return <Ico />;
}
