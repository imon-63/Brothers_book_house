import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { CartLine } from "@/lib/catalog/types";

type CartState = { lines: CartLine[] };

const initialState: CartState = { lines: [] };

const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    addLine(state, action: PayloadAction<{ kind: CartLine["kind"]; id: number; n?: number }>) {
      const { kind, id, n = 1 } = action.payload;
      const line = state.lines.find((x) => x.kind === kind && x.id === id);
      if (line) line.n += n;
      else state.lines.push({ kind, id, n });
    },
    setQty(state, action: PayloadAction<{ kind: CartLine["kind"]; id: number; n: number }>) {
      const { kind, id, n } = action.payload;
      const line = state.lines.find((x) => x.kind === kind && x.id === id);
      if (!line) return;
      if (n <= 0) state.lines = state.lines.filter((x) => x !== line);
      else line.n = n;
    },
    clearCart(state) {
      state.lines = [];
    },
    hydrateCart(state, action: PayloadAction<CartLine[]>) {
      state.lines = action.payload;
    },
  },
});

export const { addLine, setQty, clearCart, hydrateCart } = cartSlice.actions;
export const cartReducer = cartSlice.reducer;
