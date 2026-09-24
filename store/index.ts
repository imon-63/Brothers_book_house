import { configureStore } from "@reduxjs/toolkit";
import { booksReducer } from "./slices/books-slice";
import { cartReducer } from "./slices/cart-slice";
import { orderReducer } from "./slices/order-slice";
import { sessionReducer } from "./slices/session-slice";
import { shopReducer } from "./slices/shop-slice";
import { uiReducer } from "./slices/ui-slice";

export function makeStore() {
  return configureStore({
    reducer: {
      cart: cartReducer,
      orders: orderReducer,
      books: booksReducer,
      session: sessionReducer,
      ui: uiReducer,
      shop: shopReducer,
    },
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
