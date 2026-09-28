const GUEST_IDS = "cholo_guest_orders";
const GUEST_PHONE = "cholo_guest_phone";
export const PLACE_CHEER = "cholo_cheer";

export function nextOrderId(count: number) {
  return `CLO-${2042 + count}`;
}

export function rememberPlaced(id: string, phone: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PLACE_CHEER, id);
  sessionStorage.setItem("cholo_placed", "1");
  if (phone) sessionStorage.setItem(GUEST_PHONE, phone.replace(/\D/g, ""));
  let ids: string[] = [];
  try { ids = JSON.parse(sessionStorage.getItem(GUEST_IDS) || "[]") as string[]; } catch { ids = []; }
  sessionStorage.setItem(GUEST_IDS, JSON.stringify([id, ...ids.filter((x) => x !== id)].slice(0, 20)));
}

export function guestOrderKeys() {
  if (typeof window === "undefined") return { ids: [] as string[], phone: "", cheerId: "" };
  let ids: string[] = [];
  try { ids = JSON.parse(sessionStorage.getItem(GUEST_IDS) || "[]") as string[]; } catch { ids = []; }
  return {
    ids,
    phone: sessionStorage.getItem(GUEST_PHONE) || "",
    cheerId: sessionStorage.getItem(PLACE_CHEER) || "",
  };
}

export function clearCheer() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(PLACE_CHEER);
}
