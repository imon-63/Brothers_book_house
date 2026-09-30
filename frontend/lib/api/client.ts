/**
 * Cholo API client — the ONLY way the frontend talks to the backend.
 *
 * • Base URL from NEXT_PUBLIC_API_URL (default http://localhost:4000/api/v1)
 * • Access token (15 min JWT) kept in memory + sessionStorage; the refresh
 *   token lives in an httpOnly cookie set by the API (never readable here).
 * • 401 → one silent refresh (single-flight) → retry the request once.
 * • Errors are RFC 7807 problem+json → thrown as ApiError { code, detail }.
 * • Guest cart / chat identities travel in x-cart-token / x-chat-token.
 */

/** Absolute ("http://localhost:4000/api/v1") or same-origin relative ("/api/v1", behind nginx). */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1").replace(/\/$/, "");

function apiBase() {
  if (/^https?:\/\//.test(API_URL)) return API_URL;
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  return `${origin}${API_URL.startsWith("/") ? "" : "/"}${API_URL}`;
}

const ACCESS_KEY = "cholo_at";
const CART_KEY = "cholo_cart_token";
const CHAT_KEY = "cholo_chat_token";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string,
    readonly details?: Record<string, unknown>,
    readonly errors?: string[],
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

// ───────── token storage (browser only) ─────────

let accessToken: string | null = null;
const listeners = new Set<(token: string | null) => void>();

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
function local(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function getAccessToken() {
  if (accessToken === null) accessToken = storage()?.getItem(ACCESS_KEY) ?? null;
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) storage()?.setItem(ACCESS_KEY, token);
  else storage()?.removeItem(ACCESS_KEY);
  listeners.forEach((fn) => fn(token));
}

/** Subscribe to login/logout (token changes). Returns an unsubscribe fn. */
export function onAuthChange(fn: (token: string | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const cartToken = {
  get: () => local()?.getItem(CART_KEY) ?? null,
  set: (t: string | null) => (t ? local()?.setItem(CART_KEY, t) : local()?.removeItem(CART_KEY)),
};
export const chatToken = {
  get: () => local()?.getItem(CHAT_KEY) ?? null,
  set: (t: string | null) => (t ? local()?.setItem(CHAT_KEY, t) : local()?.removeItem(CHAT_KEY)),
};

// ───────── refresh (single flight) ─────────

let refreshing: Promise<string | null> | null = null;

export function refreshSession(): Promise<string | null> {
  if (!refreshing) {
    refreshing = fetch(`${apiBase()}/auth/refresh`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" })
      .then(async (res) => {
        if (!res.ok) {
          setAccessToken(null);
          return null;
        }
        const body = (await res.json()) as { accessToken: string };
        setAccessToken(body.accessToken);
        return body.accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

// ───────── request ─────────

type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  /** send Authorization if logged in (default true) */
  auth?: boolean;
  /** POST /orders etc. — same key → same result, safe to retry */
  idempotencyKey?: string;
  /** attach the guest cart token */
  cart?: boolean;
  /** attach the guest chat token */
  chat?: boolean;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** return the raw Response (CSV downloads, HTML documents) */
  raw?: boolean;
};

export function buildUrl(path: string, query?: Query) {
  const url = new URL(`${apiBase()}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, String(x)));
    else url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const p = (await res.json()) as { code?: string; detail?: string; details?: Record<string, unknown>; errors?: string[] };
    return new ApiError(res.status, p.code ?? `http.${res.status}`, p.detail ?? res.statusText, p.details, p.errors);
  } catch {
    return new ApiError(res.status, `http.${res.status}`, res.status >= 500 ? "সার্ভারে সমস্যা হয়েছে" : res.statusText);
  }
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const send = async (token: string | null) => {
    const headers: Record<string, string> = { accept: "application/json", ...(opts.headers ?? {}) };
    if (opts.body !== undefined && !(opts.body instanceof FormData)) headers["content-type"] = "application/json";
    if (token && opts.auth !== false) headers.authorization = `Bearer ${token}`;
    if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
    if (opts.cart && cartToken.get()) headers["x-cart-token"] = cartToken.get()!;
    if (opts.chat && chatToken.get()) headers["x-chat-token"] = chatToken.get()!;
    return fetch(buildUrl(path, opts.query), {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body === undefined ? undefined : opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body),
      credentials: "include",
      signal: opts.signal,
    });
  };

  let res = await send(getAccessToken());
  if (res.status === 401 && opts.auth !== false && !path.startsWith("/auth/")) {
    const fresh = await refreshSession();
    if (fresh) res = await send(fresh);
  }
  if (!res.ok) throw await toError(res);
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("json") ? await res.json() : await res.text()) as T;
}

/** Shorthands */
export const get = <T>(path: string, query?: Query, opts: Omit<RequestOptions, "query" | "method"> = {}) => api<T>(path, { ...opts, query });
export const post = <T>(path: string, body?: unknown, opts: Omit<RequestOptions, "body" | "method"> = {}) => api<T>(path, { ...opts, method: "POST", body: body ?? {} });
export const patch = <T>(path: string, body?: unknown, opts: Omit<RequestOptions, "body" | "method"> = {}) => api<T>(path, { ...opts, method: "PATCH", body: body ?? {} });
export const put = <T>(path: string, body?: unknown, opts: Omit<RequestOptions, "body" | "method"> = {}) => api<T>(path, { ...opts, method: "PUT", body: body ?? {} });
export const del = <T>(path: string, opts: Omit<RequestOptions, "method"> = {}) => api<T>(path, { ...opts, method: "DELETE" });

/** Download a CSV/HTML endpoint as a file (auth header included). */
export async function download(path: string, filename: string, query?: Query) {
  const res = await api<Response>(path, { query, raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Human message for toasts: server detail, or a generic Bangla fallback. */
export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.detail;
  if (err instanceof TypeError) return "সার্ভারের সাথে যোগাযোগ করা যাচ্ছে না";
  return "কিছু একটা ভুল হয়েছে";
}

export function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
