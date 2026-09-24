import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { WaitItem } from "@/lib/demo/accounts";
import type { VerticalId } from "@/lib/catalog/types";

type UiState = {
  vertical: VerticalId;
  menuOpen: boolean;
  miniCartOpen: boolean;
  authOpen: boolean;
  chatOpen: boolean;
  toast: string;
  pendingWait: WaitItem | null;
};

const initialState: UiState = {
  vertical: "book",
  menuOpen: false,
  miniCartOpen: false,
  authOpen: false,
  chatOpen: false,
  toast: "",
  pendingWait: null,
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setVertical(state, action: PayloadAction<VerticalId>) {
      state.vertical = action.payload;
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
    setPendingWait(state, action: PayloadAction<WaitItem | null>) {
      state.pendingWait = action.payload;
    },
    hydrateUi(state, action: PayloadAction<VerticalId>) {
      state.vertical = action.payload;
    },
  },
});

export const { setVertical, setMenu, setMiniCart, setAuth, setChat, showToast, setPendingWait, hydrateUi } = uiSlice.actions;
export const uiReducer = uiSlice.reducer;
