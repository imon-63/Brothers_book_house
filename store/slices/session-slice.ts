import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { DEMO_USERS, type DemoUser, type WaitItem } from "@/lib/demo/accounts";

type SessionState = {
  userId: number | null;
  users: DemoUser[];
};

const initialState: SessionState = { userId: null, users: DEMO_USERS };

const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<number | null>) {
      state.userId = action.payload;
    },
    registerUser(state, action: PayloadAction<Omit<DemoUser, "id" | "role">>) {
      const id = Math.max(0, ...state.users.map((u) => u.id)) + 1;
      state.users.push({ ...action.payload, id, role: "user" });
      state.userId = id;
    },
    updateUser(state, action: PayloadAction<{ id: number; patch: Partial<Pick<DemoUser, "name" | "email" | "phone">> }>) {
      const row = state.users.find((u) => u.id === action.payload.id);
      if (row) Object.assign(row, action.payload.patch);
    },
    toggleWait(state, action: PayloadAction<{ userId: number } & WaitItem>) {
      const row = state.users.find((u) => u.id === action.payload.userId);
      if (!row) return;
      if (!row.wait) row.wait = [];
      const i = row.wait.findIndex((x) => x.kind === action.payload.kind && x.id === action.payload.id);
      if (i >= 0) row.wait.splice(i, 1);
      else row.wait.push({ kind: action.payload.kind, id: action.payload.id });
    },
    setPassword(state, action: PayloadAction<{ id: number; password: string }>) {
      const row = state.users.find((u) => u.id === action.payload.id);
      if (row) row.password = action.payload.password;
    },
    hydrateSession(state, action: PayloadAction<{ userId: number | null; users?: DemoUser[] }>) {
      state.userId = action.payload.userId;
      const saved = action.payload.users ?? [];
      if (!saved.length) return;
      const byId = new Map<number, DemoUser>();
      for (const seed of DEMO_USERS) byId.set(seed.id, { ...seed });
      for (const row of saved) {
        const seed = byId.get(row.id);
        byId.set(row.id, seed ? {
          ...seed,
          ...row,
          email: row.email?.trim() || seed.email,
          phone: row.phone?.trim() || seed.phone,
          password: row.password || seed.password,
          name: row.name?.trim() || seed.name,
          role: row.role || seed.role,
        } : row);
      }
      state.users = [...byId.values()];
    },
  },
});

export const { setUser, registerUser, updateUser, toggleWait, setPassword, hydrateSession } = sessionSlice.actions;
export const sessionReducer = sessionSlice.reducer;
