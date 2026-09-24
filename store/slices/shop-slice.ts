import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { guessCost } from "@/lib/catalog/cost";
import { catalog } from "@/lib/catalog/data";
import type { Pack, Product, VerticalId } from "@/lib/catalog/types";
import { COUPONS } from "@/lib/demo/accounts";

export type ShopProduct = Product & { cost?: number; copies?: number; freeShip?: boolean };
export type ShopPack = Pack & { freeShip?: boolean };
export type ShopCoupon = { code: string; off: number; type: "pct" | "tk"; active: boolean };
export type ShipSettings = {
  dhaka: number;
  outside: number;
  costDhaka: number;
  costOutside: number;
  freeOnPack: boolean;
  freeOnBooks: boolean;
  freeAboveOn: boolean;
  freeAbove: number;
  freeAllOn: boolean;
  freeFrom: string;
  freeTo: string;
  sslFeePct: number;
};
export type PromoSettings = { on: boolean; title: string; text: string; code: string; image: string };
export type ChatMsg = { from: "user" | "agent"; text: string; t: number };
export type ChatThread = { id: string; name: string; msgs: ChatMsg[] };
export type ExtraCat = { vertical: VerticalId; name: string; subs: string[] };
export type HiddenCat = { vertical: VerticalId; name: string; sub?: string };

export type ShopState = {
  products: ShopProduct[];
  packs: ShopPack[];
  ticker: string[];
  coupons: ShopCoupon[];
  promo: PromoSettings;
  ship: ShipSettings;
  extraCats: ExtraCat[];
  hiddenCats: HiddenCat[];
  hiddenVerticals: VerticalId[];
  chats: ChatThread[];
};

const shipSeed: ShipSettings = {
  dhaka: 60, outside: 120, costDhaka: 60, costOutside: 120,
  freeOnPack: false, freeOnBooks: false, freeAboveOn: true, freeAbove: 500,
  freeAllOn: false, freeFrom: "", freeTo: "", sslFeePct: 0,
};

function seed(): ShopState {
  return {
    products: catalog.products.map((p) => ({ ...p, cost: guessCost(p.price, p.vertical, p.id), copies: p.stock, freeShip: false })),
    packs: catalog.packs.map((p) => ({ ...p, freeShip: false })),
    ticker: [...catalog.ticker],
    coupons: COUPONS.map((c) => ({ ...c, active: true })),
    promo: {
      on: true,
      title: "প্রথম অর্ডারে ১০% ছাড়",
      text: "কুপন: CHOLO10 — চেকআউটে প্রয়োগ করুন।",
      code: "CHOLO10",
      image: "",
    },
    ship: { ...shipSeed },
    extraCats: [],
    hiddenCats: [],
    hiddenVerticals: [],
    chats: [],
  };
}

const shopSlice = createSlice({
  name: "shop",
  initialState: seed(),
  reducers: {
    hydrateShop(_state, action: PayloadAction<ShopState>) {
      return action.payload;
    },
    patchProduct(state, action: PayloadAction<{ id: number; patch: Partial<ShopProduct> }>) {
      const row = state.products.find((p) => p.id === action.payload.id);
      if (row) Object.assign(row, action.payload.patch);
    },
    holdStock(state, action: PayloadAction<{ id: number; n: number }[]>) {
      for (const move of action.payload) {
        const row = state.products.find((p) => p.id === move.id);
        if (row) row.stock = Math.max(0, row.stock - move.n);
      }
    },
    releaseStock(state, action: PayloadAction<{ id: number; n: number }[]>) {
      for (const move of action.payload) {
        const row = state.products.find((p) => p.id === move.id);
        if (row) row.stock += move.n;
      }
    },
    receiveStock(state, action: PayloadAction<{ id: number; n: number; cost: number }[]>) {
      for (const move of action.payload) {
        const row = state.products.find((p) => p.id === move.id);
        if (!row || move.n <= 0) continue;
        row.stock += move.n;
        row.copies = (row.copies || 0) + move.n;
        if (move.cost > 0) row.cost = move.cost;
      }
    },
    addProduct(state, action: PayloadAction<ShopProduct>) {
      state.products.unshift(action.payload);
    },
    deleteProduct(state, action: PayloadAction<number>) {
      state.products = state.products.filter((p) => p.id !== action.payload);
    },
    addPack(state, action: PayloadAction<ShopPack>) {
      state.packs.unshift(action.payload);
    },
    deletePack(state, action: PayloadAction<number>) {
      state.packs = state.packs.filter((p) => p.id !== action.payload);
    },
    patchPack(state, action: PayloadAction<{ id: number; patch: Partial<ShopPack> }>) {
      const row = state.packs.find((p) => p.id === action.payload.id);
      if (row) Object.assign(row, action.payload.patch);
    },
    setTicker(state, action: PayloadAction<string[]>) {
      state.ticker = action.payload;
    },
    addCoupon(state, action: PayloadAction<ShopCoupon>) {
      state.coupons.push(action.payload);
    },
    toggleCoupon(state, action: PayloadAction<string>) {
      const row = state.coupons.find((c) => c.code === action.payload);
      if (row) row.active = !row.active;
    },
    setPromo(state, action: PayloadAction<PromoSettings>) {
      state.promo = action.payload;
    },
    setShip(state, action: PayloadAction<ShipSettings>) {
      state.ship = action.payload;
    },
    addExtraCat(state, action: PayloadAction<ExtraCat>) {
      const hit = state.extraCats.find((c) => c.vertical === action.payload.vertical && c.name === action.payload.name);
      if (hit) hit.subs = [...new Set([...hit.subs, ...action.payload.subs])];
      else state.extraCats.push(action.payload);
      state.hiddenCats = state.hiddenCats.filter((h) => !(h.vertical === action.payload.vertical && h.name === action.payload.name && !h.sub));
    },
    hideCat(state, action: PayloadAction<HiddenCat>) {
      const row = action.payload;
      const dup = state.hiddenCats.some((h) => h.vertical === row.vertical && h.name === row.name && (h.sub || "") === (row.sub || ""));
      if (!dup) state.hiddenCats.push(row);
    },
    showCat(state, action: PayloadAction<HiddenCat>) {
      const row = action.payload;
      state.hiddenCats = state.hiddenCats.filter((h) => !(h.vertical === row.vertical && h.name === row.name && !h.sub));
    },
    hideVertical(state, action: PayloadAction<VerticalId>) {
      if (!state.hiddenVerticals) state.hiddenVerticals = [];
      if (state.hiddenVerticals.includes(action.payload)) return;
      if (state.hiddenVerticals.length >= 2) return;
      state.hiddenVerticals.push(action.payload);
    },
    showVertical(state, action: PayloadAction<VerticalId>) {
      state.hiddenVerticals = (state.hiddenVerticals ?? []).filter((id) => id !== action.payload);
    },
    pushChat(state, action: PayloadAction<{ id: string; name: string; from: ChatMsg["from"]; text: string }>) {
      const { id, name, from, text } = action.payload;
      let thread = state.chats.find((c) => c.id === id);
      if (!thread) {
        thread = { id, name, msgs: [] };
        state.chats.unshift(thread);
      }
      thread.name = name;
      thread.msgs.push({ from, text, t: Date.now() });
    },
  },
});

export const {
  hydrateShop, patchProduct, holdStock, releaseStock, receiveStock, addProduct, deleteProduct, addPack, deletePack, patchPack,
  setTicker, addCoupon, toggleCoupon, setPromo, setShip, addExtraCat, hideCat, showCat, hideVertical, showVertical, pushChat,
} = shopSlice.actions;
export const shopReducer = shopSlice.reducer;
