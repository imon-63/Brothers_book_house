import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { SEED_ORDERS, type DemoOrder } from "@/lib/demo/accounts";

type OrderState = { orders: DemoOrder[]; coupon: string };

const initialState: OrderState = { orders: SEED_ORDERS, coupon: "" };

const orderSlice = createSlice({
  name: "orders",
  initialState,
  reducers: {
    setCoupon(state, action: PayloadAction<string>) {
      state.coupon = action.payload;
    },
    placeOrder(state, action: PayloadAction<Omit<DemoOrder, "id" | "at" | "status">>) {
      const n = 2042 + state.orders.length;
      state.orders.unshift({ ...action.payload, id: `CLO-${n}`, status: -1, paid: false, at: Date.now() });
    },
    setOrderStatus(state, action: PayloadAction<{ id: string; status: number; stockHeld?: boolean }>) {
      const row = state.orders.find((o) => o.id === action.payload.id);
      if (!row) return;
      const prev = row.status;
      const status = action.payload.status;
      row.status = status;
      if (prev < 0 && status >= 0 && status < 5 && !row.confirmedAt) row.confirmedAt = Date.now();
      if (status === 4 || (status >= 0 && status < 5 && row.pay.toUpperCase().includes("SSL"))) row.paid = true;
      if (status === 5) {
        row.paid = false;
        if (prev !== 5 && row.cancelAt == null) row.cancelAt = prev < 0 ? -1 : Math.min(prev, 4);
      }
      if (action.payload.stockHeld !== undefined) row.stockHeld = action.payload.stockHeld;
    },
    markPaid(state, action: PayloadAction<string>) {
      const row = state.orders.find((o) => o.id === action.payload);
      if (row && row.status >= 0 && row.status < 5) row.paid = true;
    },
    hydrateOrders(state, action: PayloadAction<OrderState>) {
      state.orders = action.payload.orders;
      state.coupon = action.payload.coupon;
    },
  },
});

export const { setCoupon, placeOrder, setOrderStatus, markPaid, hydrateOrders } = orderSlice.actions;
export const orderReducer = orderSlice.reducer;
