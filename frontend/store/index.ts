import { configureStore } from "@reduxjs/toolkit";
import { uiReducer } from "./slices/ui-slice";

/** UI-only Redux (toasts, drawers, current section). All business data comes from the API. */
export function makeStore() {
  return configureStore({
    reducer: {
      ui: uiReducer,
    },
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
