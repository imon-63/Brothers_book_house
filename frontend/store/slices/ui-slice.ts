import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/** Pending "save for later" while the shopper logs in (product / bundle uuid). */
export type PendingWait = { kind: "book" | "pack"; id: string };

/**
 * UI-only state. Business data (catalog, cart, orders, books, sessions) lives
 * on the API and is read through React Query hooks in lib/api/*.
 */
type UiState = {
  /** storefront section code from GET /sections (dynamic — admins can add more) */
  section: string;
  menuOpen: boolean;
  miniCartOpen: boolean;
  authOpen: boolean;
  chatOpen: boolean;
  toast: string;
  pendingWait: PendingWait | null;
  bye: string | null;
};

const initialState: UiState = {
  section: "book",
  menuOpen: false,
  miniCartOpen: false,
  authOpen: false,
  chatOpen: false,
  toast: "",
  pendingWait: null,
  bye: null,
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setSection(state, action: PayloadAction<string>) {
      state.section = action.payload;
    },
    setMenu(state, action: PayloadAction<boolean>) {
      state.menuOpen = action.payload;
    },
    setMiniCart(state, action: PayloadAction<boolean>) {
      state.miniCartOpen = action.payload;
    },
    setAuth(state, action: PayloadAction<boolean>) {
      state.authOpen = action.payload;
    },
    setChat(state, action: PayloadAction<boolean>) {
      state.chatOpen = action.payload;
    },
    showToast(state, action: PayloadAction<string>) {
      state.toast = action.payload;
    },
    setPendingWait(state, action: PayloadAction<PendingWait | null>) {
      state.pendingWait = action.payload;
    },
    setBye(state, action: PayloadAction<string | null>) {
      state.bye = action.payload;
    },
    hydrateUi(state, action: PayloadAction<string>) {
      state.section = action.payload;
    },
  },
});

export const { setSection, setMenu, setMiniCart, setAuth, setChat, showToast, setPendingWait, setBye, hydrateUi } = uiSlice.actions;
/** @deprecated use setSection — kept for older call sites */
export const setVertical = setSection;
export const uiReducer = uiSlice.reducer;
