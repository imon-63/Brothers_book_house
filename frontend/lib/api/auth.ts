"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getAccessToken, onAuthChange, post, refreshSession, setAccessToken } from "./client";

export type Role = "OWNER" | "ADMIN" | "MANAGER" | "SUPPORT" | "ACCOUNTANT" | "WAREHOUSE" | "CUSTOMER";
export const STAFF_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "SUPPORT", "ACCOUNTANT", "WAREHOUSE"];

export type Me = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  status: string;
  avatarUrl: string | null;
  preferences: Record<string, unknown>;
  customer: { id: string; ordersCount: number; totalSpent: string | number } | null;
};

type Tokens = { accessToken: string; refreshToken: string; expiresIn: number };

export const meKey = ["auth", "me"] as const;

export async function login(identifier: string, password: string) {
  const t = await post<Tokens>("/auth/login", { identifier, password }, { auth: false });
  setAccessToken(t.accessToken);
  return fetchMe();
}

export async function register(input: { name: string; phone: string; email?: string; password: string }) {
  const t = await post<Tokens>("/auth/register", input, { auth: false });
  setAccessToken(t.accessToken);
  return fetchMe();
}

export async function logout() {
  try {
    await post("/auth/logout");
  } finally {
    setAccessToken(null);
  }
}

export const fetchMe = () => api<Me>("/auth/me");

/** Restore the session on first load via the refresh cookie. */
let bootstrapped: Promise<string | null> | null = null;
export function bootstrapSession() {
  if (!bootstrapped) bootstrapped = getAccessToken() ? Promise.resolve(getAccessToken()) : refreshSession();
  return bootstrapped;
}

/**
 * Current user (null = guest). Re-fetches on login/logout anywhere in the app.
 *   const { me, loading, isStaff } = useMe();
 */
export function useMe() {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    bootstrapSession().finally(() => alive && setReady(true));
    const off = onAuthChange(() => qc.invalidateQueries({ queryKey: meKey }));
    return () => {
      alive = false;
      off();
    };
  }, [qc]);
  const q = useQuery({
    queryKey: meKey,
    enabled: ready,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => (getAccessToken() ? fetchMe().catch(() => null) : null),
  });
  const me = q.data ?? null;
  return { me, loading: !ready || q.isLoading, isStaff: !!me && STAFF_ROLES.includes(me.role), isAdmin: !!me && (me.role === "OWNER" || me.role === "ADMIN") };
}
