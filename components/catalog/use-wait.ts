"use client";

import type { WaitItem } from "@/lib/demo/accounts";
import { toggleWait } from "@/store/slices/session-slice";
import { setAuth, setPendingWait, showToast } from "@/store/slices/ui-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

export function useWait() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.session.users.find((u) => u.id === s.session.userId) ?? null);

  function saved(kind: WaitItem["kind"], id: number) {
    return Boolean(user?.wait?.some((x) => x.kind === kind && x.id === id));
  }

  function toggle(kind: WaitItem["kind"], id: number) {
    if (!user) {
      dispatch(setPendingWait({ kind, id }));
      dispatch(setAuth(true));
      dispatch(showToast("লগইন করলে তালিকায় রাখতে পারবেন"));
      return;
    }
    const on = saved(kind, id);
    dispatch(toggleWait({ userId: user.id, kind, id }));
    dispatch(showToast(on ? "তালিকা থেকে সরানো হয়েছে" : "ভবিষ্যৎ অর্ডারে রাখা হয়েছে"));
  }

  return { user, saved, toggle };
}
