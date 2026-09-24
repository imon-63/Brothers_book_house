import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  bookOrder, emptyBooks, type BooksState, type CashAccount, type CashKind, type PurchaseLine,
} from "@/lib/books/ledger";
import type { DemoOrder } from "@/lib/demo/accounts";

const booksSlice = createSlice({
  name: "books",
  initialState: emptyBooks(),
  reducers: {
    hydrateBooks(_state, action: PayloadAction<BooksState>) {
      return {
        papers: action.payload.papers || [],
        purchases: action.payload.purchases || [],
        cash: action.payload.cash || [],
        seq: action.payload.seq || 100,
      };
    },
    applyOrderBooks(state, action: PayloadAction<{
      order: DemoOrder;
      next: number;
      feePct: number;
      at?: number;
      markPaid?: boolean;
      credit?: { reason: string; courierLoss: number };
    }>) {
      bookOrder(state, action.payload);
    },
    addPurchase(state, action: PayloadAction<{
      supplier: string;
      at: number;
      lines: PurchaseLine[];
      paid: boolean;
      account: CashAccount;
      note: string;
    }>) {
      const { supplier, at, lines, paid, account, note } = action.payload;
      const clean = lines.filter((line) => line.qty > 0 && line.cost > 0);
      if (!supplier.trim() || !clean.length) return;
      state.seq += 1;
      const id = `PUR-${state.seq}`;
      const total = clean.reduce((s, line) => s + line.qty * line.cost, 0);
      state.purchases.unshift({ id, supplier: supplier.trim(), at, lines: clean, total, paid, account, note: note.trim() });
      if (paid) {
        state.seq += 1;
        state.cash.unshift({
          id: `CSH-${state.seq}`,
          at,
          account,
          dir: "out",
          amount: total,
          memo: `ক্রয় ${id} · ${supplier.trim()}`,
          ref: id,
          kind: "purchase",
        });
      }
    },
    addCash(state, action: PayloadAction<{
      at: number;
      account: CashAccount;
      dir: "in" | "out";
      amount: number;
      memo: string;
      kind?: CashKind;
      ref?: string;
    }>) {
      const row = action.payload;
      if (!row.memo.trim() || !(row.amount > 0)) return;
      if (row.ref && row.kind && state.cash.some((c) => c.ref === row.ref && c.kind === row.kind)) return;
      state.seq += 1;
      state.cash.unshift({
        id: `CSH-${state.seq}`,
        at: row.at,
        account: row.account,
        dir: row.dir,
        amount: row.amount,
        memo: row.memo.trim(),
        ref: row.ref,
        kind: row.kind || "manual",
      });
    },
  },
});

export const { hydrateBooks, applyOrderBooks, addPurchase, addCash } = booksSlice.actions;
export const booksReducer = booksSlice.reducer;
