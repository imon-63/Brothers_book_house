"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { catTree, shopHref } from "@/lib/catalog/cats";
import { guessCost } from "@/lib/catalog/cost";
import { catalog } from "@/lib/catalog/data";
import { nextDealAt } from "@/lib/catalog/offer";
import { describeLine } from "@/lib/cart/describe";
import { AlsoStrip } from "@/components/catalog/like-strip";
import { PackSpines } from "@/components/catalog/pack-card";
import { bn } from "@/lib/format";
import { hydrateCart, setQty } from "@/store/slices/cart-slice";
import { seedFromOrders, type BooksState } from "@/lib/books/ledger";
import { DEMO_USERS, SEED_ORDERS, type DemoOrder, type DemoUser } from "@/lib/demo/accounts";
import { hydrateBooks } from "@/store/slices/books-slice";
import { hydrateOrders } from "@/store/slices/order-slice";
import { hydrateShop, pushChat, type ShopState } from "@/store/slices/shop-slice";
import { hydrateSession, registerUser, setPassword, setUser, toggleWait } from "@/store/slices/session-slice";
import { hydrateUi, setAuth, setChat, setMenu, setMiniCart, setPendingWait, setVertical, showToast } from "@/store/slices/ui-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { SearchBox } from "@/components/layout/search-box";
import { IconCart, VerticalIcon } from "@/components/icons";
import type { CartLine, VerticalId } from "@/lib/catalog/types";

const STORE_KEY = "cholo_next_v1";
const QUICK = ["অর্ডার কোথায়?", "বই স্টকে আছে?", "ডেলিভারি চার্জ", "কুপন কোড"];

function pageName(path: string) {
  if (path.startsWith("/shop")) return "ক্যাটাগরি";
  if (path.startsWith("/product")) return "পণ্য";
  if (path.startsWith("/packs") || path.startsWith("/pack")) return "প্যাকেজ";
  if (path.startsWith("/authors")) return "লেখক";
  if (path.startsWith("/cart")) return "কার্ট";
  if (path.startsWith("/checkout")) return "চেকআউট";
  if (path.startsWith("/orders")) return "অর্ডার";
  if (path.startsWith("/wait")) return "ভবিষ্যৎ অর্ডার";
  if (path.startsWith("/track")) return "অর্ডার খুঁজুন";
  if (path.startsWith("/admin")) return "অ্যাডমিন";
  return "হোম";
}

export function SiteFrame({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const path = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [scrollPct, setScrollPct] = useState(0);
  const [badgePop, setBadgePop] = useState(false);
  const [fromLabel, setFromLabel] = useState("হোম");
  const [pageIn, setPageIn] = useState("");
  const ring = useRef<SVGCircleElement>(null);
  const prevCount = useRef(0);
  const prevPath = useRef("/");
  const [ready, setReady] = useState(false);
  const [dealClock, setDealClock] = useState(0);
  const [catsOn, setCatsOn] = useState(false);
  const [navGen, setNavGen] = useState(0);
  const [promo, setPromo] = useState(false);
  const [gate, setGate] = useState<string | null>(null);
  const gateToast = useRef("");
  const vertical = useAppSelector((s) => s.ui.vertical);
  const prevVert = useRef(vertical);
  const navArmed = useRef(false);
  const menuOpen = useAppSelector((s) => s.ui.menuOpen);
  const miniOpen = useAppSelector((s) => s.ui.miniCartOpen);
  const authOpen = useAppSelector((s) => s.ui.authOpen);
  const chatOpen = useAppSelector((s) => s.ui.chatOpen);
  const toast = useAppSelector((s) => s.ui.toast);
  const lines = useAppSelector((s) => s.cart.lines);
  const user = useAppSelector((s) => s.session.users.find((u) => u.id === s.session.userId) ?? null);
  const users = useAppSelector((s) => s.session.users);
  const orders = useAppSelector((s) => s.orders.orders);
  const coupon = useAppSelector((s) => s.orders.coupon);
  const books = useAppSelector((s) => s.books);
  const shop = useAppSelector((s) => s.shop);
  const threadId = user ? `u-${user.id}` : "guest";
  const thread = shop.chats.find((c) => c.id === threadId);
  const count = lines.reduce((s, l) => s + l.n, 0);
  const meta = catalog.verticals.find((v) => v.id === vertical) ?? catalog.verticals[0];
  const tree = catTree(vertical, shop.products, shop.extraCats, shop.hiddenCats);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null") as {
        lines?: CartLine[];
        vertical?: VerticalId;
        userId?: number | null;
        users?: DemoUser[];
        orders?: DemoOrder[];
        coupon?: string;
        shop?: ShopState;
        books?: BooksState;
      } | null;
      if (raw?.lines) dispatch(hydrateCart(raw.lines));
      if (raw?.vertical) dispatch(hydrateUi(raw.vertical));
      if (raw) dispatch(hydrateSession({ userId: raw.userId ?? null, users: raw.users }));
      if (raw?.orders) dispatch(hydrateOrders({ orders: raw.orders, coupon: raw.coupon || "" }));
      if (raw?.books?.papers && raw.books.cash) dispatch(hydrateBooks(raw.books));
      else dispatch(hydrateBooks(seedFromOrders(raw?.orders?.length ? raw.orders : SEED_ORDERS, raw?.shop?.ship?.sslFeePct ?? 0)));
      if (raw?.shop?.products) {
        let migrated = false;
        const byId = new Map(catalog.products.map((p) => [p.id, p]));
        raw.shop.products = raw.shop.products.map((p) => {
          const next = byId.get(p.id);
          let row = p;
          if (next?.image && next.vertical === "book" && !p.image) {
            migrated = true;
            row = { ...p, title: next.title, author: next.author, price: next.price, old: next.old, image: next.image, desc: next.desc };
          }
          if (!(row.cost && row.cost > 0)) {
            const cost = guessCost(row.price, row.vertical, row.id);
            if (cost > 0) row = { ...row, cost };
          }
          return row;
        });
        if (migrated) {
          const packs = new Map(catalog.packs.map((p) => [p.id, p]));
          raw.shop.packs = raw.shop.packs.map((p) => {
            const next = packs.get(p.id);
            return next ? { ...p, price: next.price, old: next.old, desc: next.desc } : p;
          });
        }
        dispatch(hydrateShop(raw.shop));
      }
    } catch { /* keep seed */ }
    setReady(true);
    if (!sessionStorage.getItem("cholo_promo_seen")) setPromo(true);
  }, [dispatch]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORE_KEY, JSON.stringify({ lines, vertical, userId: user?.id ?? null, users, orders, coupon, shop, books }));
  }, [ready, lines, vertical, user, users, orders, coupon, shop, books]);

  useEffect(() => {
    const until = nextDealAt(shop.products);
    if (!until) return;
    const wait = Math.max(400, until - Date.now() + 400);
    const id = window.setTimeout(() => setDealClock((n) => n + 1), wait);
    return () => window.clearTimeout(id);
  }, [shop.products, dealClock]);

  useEffect(() => {
    document.body.classList.remove("vert-book", "vert-food", "vert-gadget");
    document.body.classList.add(`vert-${vertical}`);
  }, [vertical]);

  useEffect(() => {
    if (!ready) return;
    if (!navArmed.current) {
      navArmed.current = true;
      prevVert.current = vertical;
      return;
    }
    if (prevVert.current === vertical) return;
    prevVert.current = vertical;
    setNavGen((n) => n + 1);
  }, [ready, vertical]);

  useEffect(() => {
    document.body.classList.toggle("mnav-lock", menuOpen || miniOpen);
  }, [menuOpen, miniOpen]);

  useLayoutEffect(() => {
    const from = prevPath.current;
    setFromLabel(pageName(from));
    setPageIn(path.startsWith("/checkout") && !from.startsWith("/checkout") ? "from-right" : "");
    prevPath.current = path;
  }, [path]);

  useEffect(() => {
    if (!ready || count === prevCount.current) {
      prevCount.current = count;
      return;
    }
    prevCount.current = count;
    setBadgePop(true);
    const t = setTimeout(() => setBadgePop(false), 450);
    return () => clearTimeout(t);
  }, [count, ready]);

  useEffect(() => {
    const sync = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      const p = max > 8 ? Math.min(1, Math.max(0, y / max)) : 0;
      const len = 2 * Math.PI * 26;
      if (ring.current) ring.current.style.strokeDasharray = `${(len * p).toFixed(1)} ${len.toFixed(1)}`;
      setScrolled((shown) => (p >= 0.25) === shown ? shown : p >= 0.25);
      setScrollPct((cur) => {
        const next = Math.round(p * 100);
        return cur === next ? cur : next;
      });
    };
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => dispatch(showToast("")), 1600);
    return () => clearTimeout(t);
  }, [toast, dispatch]);

  const hiddenVerts = shop.hiddenVerticals ?? [];
  const showVerts = catalog.verticals.filter((v) => user?.role === "admin" || !hiddenVerts.includes(v.id));

  useEffect(() => {
    if (!ready || user?.role === "admin") return;
    if (!hiddenVerts.includes(vertical)) return;
    const next = catalog.verticals.find((v) => !hiddenVerts.includes(v.id));
    if (next) dispatch(setVertical(next.id));
  }, [ready, user, vertical, hiddenVerts, dispatch]);

  function pickVertical(id: VerticalId) {
    dispatch(setVertical(id));
    router.push("/");
  }

  function copyCoupon(code: string) {
    navigator.clipboard?.writeText(code).catch(() => undefined);
    dispatch(showToast(`${code} কপি হয়েছে · চেকআউটে বসান`));
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-marquee">
          <div className="topbar-track">
            {[0, 1].map((copy) => (
              <div className="topbar-run" key={copy} aria-hidden={copy === 1}>
                {Array.from({ length: 4 }, () => shop.ticker).flat().map((t, i) => <span key={`${copy}-${i}`}>{t}</span>)}
              </div>
            ))}
          </div>
        </div>
        <div className="topbar-fixed">
          হেল্পলাইন: <a href="tel:017910948088">017910948088</a>
        </div>
      </div>

      <header className="site">
        <div className="wrap nav">
          <button className="icon-btn menu-btn" type="button" aria-label="মেনু" onClick={() => dispatch(setMenu(true))}>☰</button>
          <Link className="logo" href="/">
            <img className="mark" src="/icons/cholo-mark.svg" alt="চলো" width={52} height={52} />
            <div className="logo-word"><strong>চলো</strong><small>কিনে ফেলি</small></div>
          </Link>
          <nav className={`links${navGen ? " nav-in" : ""}`} key={navGen}>
            <Link data-nav="home" className={path === "/" ? "active" : ""} href="/">হোম</Link>
            <div className={`nav-cat${catsOn ? " on" : ""}${path.startsWith("/shop") ? " plain" : ""}`}>
              <a data-nav="shop" href="/shop" className={path.startsWith("/shop") ? "active" : ""} onClick={(e) => { if (!path.startsWith("/shop")) { e.preventDefault(); setCatsOn((v) => !v); } }}>ক্যাটাগরি</a>
              <div className="nav-cat-menu">
                {tree.map((node, i) => (
                  <span key={node.name} style={{ animationDelay: `${80 + i * 36}ms` }}>
                    <Link href={shopHref(node.name)} onClick={() => setCatsOn(false)}>{node.name}</Link>
                    {node.subs.map((s) => (
                      <Link className="kid" key={s} href={shopHref(node.name, s)} onClick={() => setCatsOn(false)}>{s}</Link>
                    ))}
                  </span>
                ))}
              </div>
            </div>
            <Link className={`book-only${path.startsWith("/packs") || path.startsWith("/pack") ? " active" : ""}`} href="/packs">প্যাকেজ</Link>
            <Link className={`book-only${path.startsWith("/authors") ? " active" : ""}`} href="/authors">লেখক</Link>
            <Link className={path.startsWith("/orders") ? "active" : ""} href={user ? "/orders" : "/track"}>অর্ডার</Link>
            {user && user.role !== "admin" ? <Link className={path.startsWith("/wait") ? "active" : ""} href="/wait">ভবিষ্যৎ</Link> : null}
          </nav>
          <div className="nav-tools">
            <div className="nav-cpns">
              {shop.coupons.filter((c) => c.active).map((c) => (
                <button key={c.code} type="button" className={`nav-cpn${coupon === c.code ? " on" : ""}`} onClick={() => copyCoupon(c.code)}>
                  <span><code>{c.code}</code><i>{c.type === "pct" ? `${bn(c.off)}% ছাড়` : `৳${bn(c.off)} ছাড়`}</i></span>
                </button>
              ))}
            </div>
            <SearchBox placeholder={meta.search} />
            <button className="icon-btn cart-btn" type="button" aria-label="কার্ট" onClick={() => dispatch(setMiniCart(true))}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1C1410" strokeWidth="2"><path d="M6 6h15l-1.5 9h-12z" /><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M6 6 5 3H2" /></svg>
              <i className={`badge${badgePop ? " pop" : ""}`}>{bn(count)}</i>
            </button>
            {user ? (
              <div className="user-chip">
                {user.role === "admin" ? <Link className="btn btn-gold btn-sm" href="/admin">অ্যাডমিন</Link> : null}
                <Link className="btn btn-ghost btn-sm" href="/profile">{user.role === "admin" ? "প্রোফাইল" : user.name.split(" ")[0]}</Link>
              </div>
            ) : (
              <button className="btn btn-primary" type="button" onClick={() => dispatch(setAuth(true))}>লগইন</button>
            )}
          </div>
        </div>
        <div className="vbar">
          <div className="wrap vbar-in">
            {showVerts.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`vtab${vertical === v.id ? " on" : ""}`}
                onClick={() => pickVertical(v.id)}
              >
                <VerticalIcon id={v.id} /> {v.name}
              </button>
            ))}
          </div>
        </div>
        <div className={`backbar${path === "/" ? "" : " on"}`}>
          <div className="wrap">
            <button type="button" className="back-btn" onClick={() => router.back()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 5 8 12l7 7" /></svg>
              ফিরে যান <small>· {fromLabel}</small>
            </button>
          </div>
        </div>
      </header>

      <div className={`mnav${menuOpen ? " on" : ""}`}>
        <button className="mnav-back" type="button" aria-label="বন্ধ" onClick={() => dispatch(setMenu(false))} />
        <aside className="mnav-sheet" role="dialog" aria-label="মেনু">
          <div className="mnav-head">
            <b>মেনু</b>
            <button className="x" type="button" aria-label="বন্ধ" onClick={() => dispatch(setMenu(false))}>×</button>
          </div>
          <SearchBox placeholder={meta.search} />
          <div className="mnav-verts">
            {showVerts.map((v) => (
              <button key={v.id} type="button" className={`vtab${vertical === v.id ? " on" : ""}`} onClick={() => pickVertical(v.id)}>
                <VerticalIcon id={v.id} /> {v.name}
              </button>
            ))}
          </div>
          <nav className={`mnav-links${navGen ? " nav-in" : ""}`} key={`m-${navGen}`}>
            <Link href="/" onClick={() => dispatch(setMenu(false))}>হোম</Link>
            <Link href="/shop" onClick={() => dispatch(setMenu(false))}>ক্যাটাগরি</Link>
            <div className="mnav-cats">
              {tree.map((node, i) => (
                <Link key={node.name} href={shopHref(node.name)} style={{ animationDelay: `${60 + i * 32}ms` }} onClick={() => dispatch(setMenu(false))}>{node.name}</Link>
              ))}
            </div>
            <Link className="book-only" href="/packs" onClick={() => dispatch(setMenu(false))}>প্যাকেজ</Link>
            <Link className="book-only" href="/authors" onClick={() => dispatch(setMenu(false))}>লেখক</Link>
            <Link href="/orders" onClick={() => dispatch(setMenu(false))}>অর্ডার</Link>
            {user && user.role !== "admin" ? <Link href="/wait" onClick={() => dispatch(setMenu(false))}>ভবিষ্যৎ অর্ডার</Link> : null}
            <Link href="/track" onClick={() => dispatch(setMenu(false))}>অর্ডার খুঁজুন</Link>
            <button type="button" onClick={() => { dispatch(setMenu(false)); dispatch(setMiniCart(true)); }}>কার্ট</button>
          </nav>
          <p className="mnav-help">হেল্পলাইন <a href="tel:017910948088">017910948088</a></p>
        </aside>
      </div>

      <main className={pageIn ? `page-${pageIn}` : undefined} key={pageIn || "page"}>{children}</main>

      <footer className="site">
        <div className="wrap fgrid">
          <div className="foot-brand">
            <img className="mark" src="/icons/cholo-mark.svg" alt="চলো" width={56} height={56} />
            <div>
              <h4>চলো</h4>
              <p className="foot-tag">চলো, কিনে ফেলি</p>
              <p className="foot-lead">বই, ঘরের বাজার ও গ্যাজেট — এক ঠিকানায়। সারা দেশে হোম ডেলিভারি।</p>
            </div>
          </div>
          <div>
            <h4>লিংক</h4>
            <Link href="/shop">ক্যাটাগরি</Link>
            <Link className="book-only" href="/packs">প্যাকেজ</Link>
            <Link className="book-only" href="/authors">লেখক</Link>
            <Link href="/orders">অর্ডার</Link>
            {user?.role === "admin" ? null : <Link href="/wait">ভবিষ্যৎ অর্ডার</Link>}
            <Link href="/track">অর্ডার খুঁজুন</Link>
          </div>
          <div>
            <h4>হেল্পলাইন</h4>
            <p><a href="tel:017910948088">017910948088</a></p>
            <p>পেমেন্ট: SSLCOMMERZ</p>
            <p><button type="button" onClick={() => dispatch(setChat(true))}>লাইভ চ্যাট</button></p>
            <p>বিকাশ · নগদ · কার্ড</p>
          </div>
        </div>
        <div className="wrap copy">© ২০২৬ চলো · চলো, কিনে ফেলি</div>
      </footer>

      <MiniCart open={miniOpen} onClose={() => dispatch(setMiniCart(false))} />

      <button className={`scroll-top${scrolled ? " show" : ""}`} type="button" aria-label={`উপরে যান · ${bn(scrollPct)}%`} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
        <svg className="ring" viewBox="0 0 58 58" aria-hidden><circle ref={ring} cx="29" cy="29" r="26" /></svg>
        <i><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M6 14l6-6 6 6" /></svg></i>
      </button>
      <button className={`chat-fab${chatOpen ? " on" : ""}`} type="button" aria-label="লাইভ চ্যাট" onClick={() => dispatch(setChat(!chatOpen))}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a8.5 8.5 0 0 1-8.5 8.5H8l-4 3V12A8.5 8.5 0 1 1 21 12z" /></svg>
      </button>
      <div className={`chat-panel${chatOpen ? " on" : ""}`} role="dialog" aria-label="লাইভ চ্যাট">
        <div className="chat-head">
          <div className="chat-av">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a8.5 8.5 0 0 1-8.5 8.5H8l-4 3V12A8.5 8.5 0 1 1 21 12z" /></svg>
          </div>
          <div>
            <b>চলো সাপোর্ট</b>
            <small><i className="on-dot"></i>অনলাইন · সাধারণত সাথে সাথে জবাব</small>
          </div>
          <div className="chat-head-acts">
            <a className="wa" href="https://wa.me/88017910948088" target="_blank" rel="noopener" aria-label="হোয়াটসঅ্যাপ">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.5 2 2 6.37 2 11.76c0 1.72.46 3.4 1.34 4.88L2 22l5.54-1.45A10.2 10.2 0 0 0 12.04 21.5C17.58 21.5 22.1 17.13 22.1 11.74 22.08 6.37 17.56 2 12.04 2z" /></svg>
            </a>
            <a className="call" href="tel:017910948088" aria-label="কল">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7.2 3.8h2.6l1.2 3-1.7 1.2a12 12 0 0 0 5.7 5.7l1.2-1.7 3 1.2v2.6c0 .8-.7 1.5-1.5 1.5C9.8 17.3 6.7 8.2 6.7 5.3c0-.8.7-1.5 1.5-1.5z" /></svg>
            </a>
            <button type="button" aria-label="বন্ধ" onClick={() => dispatch(setChat(false))}>×</button>
          </div>
        </div>
        <div className="chat-msgs">
          <div className="chat-bub agent">আসসালামু আলাইকুম। কীভাবে সাহায্য করতে পারি?</div>
          {(thread?.msgs ?? []).map((m, i) => <div key={i} className={`chat-bub ${m.from === "user" ? "user" : "agent"}`}>{m.text}</div>)}
        </div>
        {(thread?.msgs.length ?? 0) < 3 ? (
          <div className="chat-quick">
            {QUICK.map((t) => (
              <button key={t} type="button" onClick={() => dispatch(pushChat({ id: threadId, name: user?.name || "গেস্ট", from: "user", text: t }))}>{t}</button>
            ))}
          </div>
        ) : null}
        <ChatComposer placeholder="মেসেজ লিখুন..." onSend={(text) => dispatch(pushChat({ id: threadId, name: user?.name || "গেস্ট", from: "user", text }))} />
      </div>
      {authOpen ? <AuthModal onEnter={(name, toast) => { gateToast.current = toast; setGate(name); }} /> : null}
      {gate ? <LoginGate name={gate} onDone={() => { setGate(null); if (gateToast.current) { dispatch(showToast(gateToast.current)); gateToast.current = ""; } }} /> : null}
      {promo && shop.promo.on ? (
        <div className="overlay on" onClick={(e) => { if (e.target === e.currentTarget) { setPromo(false); sessionStorage.setItem("cholo_promo_seen", "1"); } }}>
          <div className="promo-card">
            <button className="x" type="button" aria-label="বন্ধ" onClick={() => { setPromo(false); sessionStorage.setItem("cholo_promo_seen", "1"); }}>×</button>
            <div className="promo-art">{shop.promo.image ? <img src={shop.promo.image} alt="" /> : <b>{shop.promo.title}</b>}</div>
            <div className="body">
              <h3>{shop.promo.title}</h3>
              <p>{shop.promo.text}</p>
              <Link className="btn btn-primary btn-wide" href="/shop" onClick={() => { setPromo(false); sessionStorage.setItem("cholo_promo_seen", "1"); }}>ক্যাটালগ দেখুন</Link>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? <div className="toast show">{toast}</div> : null}
    </>
  );
}

function MiniCart({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const lines = useAppSelector((s) => s.cart.lines);
  const vertical = useAppSelector((s) => s.ui.vertical);
  const n = lines.reduce((s, l) => s + l.n, 0);
  const products = useAppSelector((s) => s.shop.products);
  const packs = useAppSelector((s) => s.shop.packs);
  const rows = lines.map((line) => ({ ...line, ...describeLine(line, products, packs) }));
  const sub = rows.reduce((s, r) => s + r.price * r.n, 0);
  const taken = new Set(lines.filter((l) => l.kind === "book").map((l) => l.id));
  let also = products.filter((p) => p.vertical === vertical && p.stock > 0 && !taken.has(p.id));
  if (!also.length) also = products.filter((p) => p.vertical === vertical && !taken.has(p.id));
  while (also.length && also.length < 6) also = also.concat(also);
  also = also.slice(0, 8);

  return (
    <div className={`minicart${open ? " on" : ""}`}>
      <button className="minicart-back" type="button" aria-label="বন্ধ" onClick={onClose} />
      <aside className="minicart-sheet" role="dialog" aria-label="কার্ট">
        <div className="minicart-head">
          <div className="minicart-title">
            <span className="minicart-ico"><IconCart size={20} /></span>
            <div>
              <b>আপনার কার্ট</b>
              <small>{lines.length ? `${bn(lines.length)}টি আইটেম · ${bn(n)} কপি` : "এখনো খালি"}</small>
            </div>
          </div>
          <button className="x" type="button" aria-label="বন্ধ" onClick={onClose}>×</button>
        </div>
        <div className="minicart-body">
          {!rows.length ? (
            <div className="minicart-empty">
              <img className="empty-art" src="/icons/empty-cart.png" alt="কার্ট খালি" width={200} height={200} />
              <p className="serif" style={{ fontSize: 22, color: "var(--burgundy)", marginBottom: 8 }}>কার্ট খালি</p>
              <p className="author">পছন্দের পণ্য যোগ করুন।</p>
            </div>
          ) : rows.map((r) => (
            <article className="cart-row" key={`${r.kind}-${r.id}`}>
              {r.kind === "pack" ? (
                <Link className="cart-pack" href={r.href} onClick={onClose}>
                  <PackSpines books={r.books} />
                </Link>
              ) : r.image ? (
                <Link className="cart-cover has-pic" href={r.href} onClick={onClose}><img src={r.image} alt="" /></Link>
              ) : (
                <Link className="cart-cover" href={r.href} onClick={onClose} style={{ background: r.color }}>
                  <div className="ct">{r.title}</div>
                  <div className="ca">{r.sub}</div>
                </Link>
              )}
              <div className="cart-info">
                <h3><Link href={r.href} onClick={onClose}>{r.title}</Link></h3>
                <div className="author">
                  {r.vertical !== "book" ? <span className="vtag">{r.vertName}</span> : null}
                  {r.sub}{r.cat ? ` · ${r.cat}` : ""}
                </div>
                <div className="cart-unit">
                  <b>৳{bn(r.price)}</b>
                  {r.old > r.price ? <span className="old">৳{bn(r.old)}</span> : null}
                </div>
                <div className="cart-ops">
                  <div className="qty">
                    <button type="button" aria-label="কমান" onClick={() => dispatch(setQty({ kind: r.kind, id: r.id, n: r.n - 1 }))}>−</button>
                    <span>{bn(r.n)}</span>
                    <button type="button" aria-label="বাড়ান" onClick={() => dispatch(setQty({ kind: r.kind, id: r.id, n: r.n + 1 }))}>+</button>
                  </div>
                  <div className="cart-sum">
                    <div className="price">৳{bn(r.price * r.n)}</div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="cart-del"
                aria-label="সরান"
                onClick={() => {
                  dispatch(setQty({ kind: r.kind, id: r.id, n: 0 }));
                  dispatch(showToast("কার্ট থেকে সরানো হয়েছে"));
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 7V5h4v2M6 7l1.1 13h9.8L18 7M10 11v6M14 11v6" /></svg>
              </button>
            </article>
          ))}
        </div>
        {rows.length ? (
          <div className="minicart-foot">
            <div className="row"><span>সাবটোটাল</span><span>৳{bn(sub)}</span></div>
            <div className="row total"><span>মোট</span><span>৳{bn(sub)}</span></div>
            <Link className="btn add-cart btn-wide" href="/cart" onClick={onClose}>
              <IconCart /> চেকআউট
            </Link>
            <AlsoStrip products={also} mini />
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function bnDigits(value: string) {
  return value.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)));
}

function normLogin(raw: string) {
  return bnDigits(raw)
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
    .replace(/＠/g, "@")
    .trim()
    .toLowerCase();
}

function phoneKeyOf(raw: string) {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 11 ? digits.slice(-11) : digits;
}

function accountPool(users: DemoUser[]) {
  const byId = new Map<number, DemoUser>();
  for (const seed of DEMO_USERS) byId.set(seed.id, { ...seed });
  for (const row of users) {
    const seed = DEMO_USERS.find((s) => s.id === row.id);
    byId.set(row.id, seed ? {
      ...seed,
      ...row,
      email: row.email?.trim() || seed.email,
      phone: row.phone?.trim() || seed.phone,
      password: row.password || seed.password,
      name: row.name?.trim() || seed.name,
    } : row);
  }
  return [...byId.values()];
}

function findAccount(users: DemoUser[], id: string) {
  const q = normLogin(id);
  if (!q) return null;
  const email = q.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/)?.[0] || "";
  const phoneKey = phoneKeyOf(q);
  const asPhone = !email && phoneKey.length >= 10;
  return accountPool(users).find((u) => {
    const emails = [normLogin(u.email || "")];
    const seed = DEMO_USERS.find((s) => s.id === u.id);
    if (seed?.email) emails.push(normLogin(seed.email));
    if (email && emails.includes(email)) return true;
    if (!email && emails.includes(q)) return true;
    if (!asPhone) return false;
    const phones = [phoneKeyOf(u.phone || "")];
    if (seed?.phone) phones.push(phoneKeyOf(seed.phone));
    return phones.some((phone) => phone.length >= 10 && phone === phoneKey);
  }) ?? null;
}

function ChatComposer({ placeholder, onSend }: { placeholder: string; onSend: (text: string) => void }) {
  const { register, handleSubmit, reset } = useForm<{ text: string }>({ defaultValues: { text: "" } });
  return (
    <form className="chat-form" onSubmit={handleSubmit(({ text }) => {
      const next = text.trim();
      if (!next) return;
      onSend(next);
      reset();
    })}>
      <input {...register("text")} placeholder={placeholder} />
      <button className="send" type="submit" aria-label="পাঠান">›</button>
    </form>
  );
}

function IcoUser() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19c1.2-3.2 3.6-5 6.5-5s5.3 1.8 6.5 5" /></svg>;
}
function IcoPhone() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7.2 3.8h2.6l1.2 3-1.7 1.2a12 12 0 0 0 5.7 5.7l1.2-1.7 3 1.2v2.6c0 .8-.7 1.5-1.5 1.5C9.8 17.3 6.7 8.2 6.7 5.3c0-.8.7-1.5 1.5-1.5z" /></svg>;
}
function IcoMail() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /></svg>;
}
function IcoLock() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
}
function IcoTicket() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8.5A2.5 2.5 0 0 0 6.5 6h11A2.5 2.5 0 0 0 20 8.5v1a2 2 0 0 1 0 5v1A2.5 2.5 0 0 0 17.5 18h-11A2.5 2.5 0 0 0 4 15.5v-1a2 2 0 0 1 0-5v-1z" /><path d="M12 7v10" strokeDasharray="2 3" /></svg>;
}

function Field({ icon, warn, bad, ...props }: { icon: ReactNode; warn?: string; bad?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  const on = Boolean(warn || bad);
  return (
    <>
      <div className={`field-box${on ? " bad" : ""}`}>
        <span className="field-ico">{icon}</span>
        <input {...props} />
      </div>
      <p className={`field-warn${warn ? " on" : ""}`}>{warn}</p>
    </>
  );
}

type LoginValues = { id: string; password: string };
type SignupValues = { name: string; phone: string; email: string; password: string };
type ResetValues = { id: string; code: string; password: string };

function LoginGate({ name, onDone }: { name: string; onDone: () => void }) {
  const [bye, setBye] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = window.setTimeout(() => setBye(true), reduce ? 280 : 1680);
    const end = window.setTimeout(() => doneRef.current(), reduce ? 520 : 2140);
    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(end);
    };
  }, []);
  return (
    <div className={`land-gate${bye ? " bye" : ""}`} role="status" aria-live="polite" aria-label={`স্বাগতম, ${name}`}>
      <div className="land-stage">
        <div className="land-mark">
          <span className="land-orbit" />
          <img src="/icons/cholo-mark.svg" alt="" width={92} height={92} />
        </div>
        <div className="land-copy">
          <small>চলো</small>
          <h2>স্বাগতম, {name}</h2>
          <p>কিনে ফেলি</p>
          <div className="land-bar" aria-hidden="true"><i /></div>
        </div>
      </div>
    </div>
  );
}

function AuthModal({ onEnter }: { onEnter: (name: string, toast: string) => void }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const users = useAppSelector((s) => s.session.users);
  const pending = useAppSelector((s) => s.ui.pendingWait);
  const [view, setView] = useState<"login" | "signup" | "reset">("login");
  const loginForm = useForm<LoginValues>({ defaultValues: { id: "", password: "" } });
  const signupForm = useForm<SignupValues>({ defaultValues: { name: "", phone: "", email: "", password: "" } });
  const resetForm = useForm<ResetValues>({ defaultValues: { id: "", code: "", password: "" } });

  function close() { dispatch(setAuth(false)); }
  function go(next: "login" | "signup" | "reset") {
    setView(next);
    loginForm.clearErrors();
    signupForm.clearErrors();
    resetForm.clearErrors();
  }

  function keepPending(userId: number) {
    if (!pending) return false;
    dispatch(toggleWait({ userId, kind: pending.kind, id: pending.id }));
    dispatch(setPendingWait(null));
    return true;
  }

  function onLogin(values: LoginValues) {
    const who = values.id.trim();
    const pw = values.password;
    const hit = findAccount(users, who);
    if (!hit) {
      loginForm.setError("id", { message: "এই ইমেইল বা ফোনে অ্যাকাউন্ট নেই" });
      return;
    }
    if (hit.password !== pw) {
      loginForm.setError("password", { message: "পাসওয়ার্ড ভুল" });
      return;
    }
    dispatch(setUser(hit.id));
    close();
    onEnter(hit.name.split(" ")[0] || "চলো", keepPending(hit.id) ? "ভবিষ্যৎ অর্ডারে রাখা হয়েছে" : "");
    if (hit.role === "admin") router.push("/admin");
  }

  function onSignup(values: SignupValues) {
    const who = values.name.trim();
    const mobile = values.phone.trim();
    const mail = values.email.trim();
    const pw = values.password;
    const phoneTaken = Boolean(findAccount(users, mobile));
    const emailTaken = Boolean(mail && findAccount(users, mail));
    if (phoneTaken || emailTaken) {
      if (phoneTaken) signupForm.setError("phone", { message: "এই নম্বরে অ্যাকাউন্ট আছে" });
      if (emailTaken) signupForm.setError("email", { message: "এই ইমেইলে অ্যাকাউন্ট আছে" });
      return;
    }
    const id = Math.max(0, ...users.map((u) => u.id)) + 1;
    dispatch(registerUser({ name: who, email: mail, phone: mobile, password: pw }));
    close();
    onEnter(who.split(" ")[0] || "চলো", keepPending(id) ? "ভবিষ্যৎ অর্ডারে রাখা হয়েছে" : "");
  }

  function onReset(values: ResetValues) {
    const who = values.id.trim();
    const token = values.code.trim();
    const pw = values.password;
    const hit = findAccount(users, who);
    let bad = false;
    if (!hit) {
      resetForm.setError("id", { message: "ইউজার পাওয়া যায়নি" });
      bad = true;
    }
    if (token !== "1234" && token !== "১২৩৪") {
      resetForm.setError("code", { message: "কোড ভুল · ডেমো: ১২৩৪" });
      bad = true;
    }
    if (bad || !hit) return;
    dispatch(setPassword({ id: hit.id, password: pw }));
    dispatch(showToast("পাসওয়ার্ড বদলেছে"));
    resetForm.reset({ id: who, code: "", password: "" });
    go("login");
  }

  const loginErr = loginForm.formState.errors;
  const signupErr = signupForm.formState.errors;
  const resetErr = resetForm.formState.errors;

  return (
    <div className="overlay on" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        {view === "reset" ? (
          <form onSubmit={resetForm.handleSubmit(onReset)} noValidate>
            <h2 style={{ marginBottom: 8 }}>পাসওয়ার্ড রিসেট</h2>
            <p className="author">ইমেইল অথবা ফোনে কোড যাবে (ডেমো কোড: ১২৩৪)</p>
            <label>ইমেইল অথবা মোবাইল</label>
            <Field icon={<IcoMail />} autoComplete="username" warn={resetErr.id?.message} placeholder="ইমেইল বা ফোন" {...resetForm.register("id", { required: "ইমেইল অথবা মোবাইল দিন", onChange: () => resetForm.clearErrors("id") })} />
            <button className="btn btn-gold btn-wide" style={{ margin: "10px 0" }} type="button" onClick={() => dispatch(showToast("কোড পাঠানো হয়েছে · ডেমো: ১২৩৪"))}>কোড পাঠান</button>
            <label>কোড</label>
            <Field icon={<IcoTicket />} warn={resetErr.code?.message} placeholder="১২৩৪" {...resetForm.register("code", { required: "কোড দিন", onChange: () => resetForm.clearErrors("code") })} />
            <label>নতুন পাসওয়ার্ড</label>
            <Field icon={<IcoLock />} type="password" autoComplete="new-password" warn={resetErr.password?.message} placeholder="নতুন পাসওয়ার্ড" {...resetForm.register("password", { required: "নতুন পাসওয়ার্ড দিন", onChange: () => resetForm.clearErrors("password") })} />
            <button className="btn btn-primary btn-wide" style={{ marginTop: 14 }} type="submit">সেট করুন</button>
            <button className="btn btn-ghost btn-wide" style={{ marginTop: 8 }} type="button" onClick={() => go("login")}>লগইনে ফিরুন</button>
          </form>
        ) : (
          <form onSubmit={view === "login" ? loginForm.handleSubmit(onLogin) : signupForm.handleSubmit(onSignup)} noValidate>
            <div className="tabs">
              <button type="button" className={view === "login" ? "on" : ""} onClick={() => go("login")}>লগইন</button>
              <button type="button" className={view === "signup" ? "on" : ""} onClick={() => go("signup")}>সাইন আপ</button>
            </div>
            {view === "login" ? (
              <>
                <div className="hint">ডেমো ইউজার: rafi@gmail.com / 123456<br />অ্যাডমিন: admin@cholo.shop / admin123</div>
                <label>ইমেইল অথবা মোবাইল</label>
                <Field icon={<IcoMail />} autoComplete="username" warn={loginErr.id?.message} placeholder="ইমেইল বা 01xxxxxxxxx" {...loginForm.register("id", { required: "ইমেইল অথবা মোবাইল দিন", onChange: () => loginForm.clearErrors("id") })} />
                <label>পাসওয়ার্ড</label>
                <Field icon={<IcoLock />} type="password" autoComplete="current-password" warn={loginErr.password?.message} placeholder="পাসওয়ার্ড" {...loginForm.register("password", { required: "পাসওয়ার্ড দিন", onChange: () => loginForm.clearErrors("password") })} />
                <p style={{ margin: "10px 0" }}><a href="#" onClick={(e) => { e.preventDefault(); go("reset"); }}>পাসওয়ার্ড ভুলে গেছেন?</a></p>
                <button className="btn btn-primary btn-wide" type="submit">প্রবেশ</button>
              </>
            ) : (
              <>
                <label className="lab-ico"><IcoUser /> পূর্ণ নাম</label>
                <Field icon={<IcoUser />} autoComplete="name" warn={signupErr.name?.message} placeholder="আপনার পূর্ণ নাম" {...signupForm.register("name", { required: "পূর্ণ নাম লিখুন", onChange: () => signupForm.clearErrors("name") })} />
                <label className="lab-ico"><IcoPhone /> মোবাইল</label>
                <Field icon={<IcoPhone />} type="tel" autoComplete="tel" warn={signupErr.phone?.message} placeholder="01xxxxxxxxx" {...signupForm.register("phone", { required: "মোবাইল নম্বর দিন", validate: (v) => bnDigits(v).replace(/\D/g, "").length >= 10 || "সঠিক মোবাইল নম্বর দিন", onChange: () => signupForm.clearErrors("phone") })} />
                <label className="lab-ico"><IcoMail /> ইমেইল <span className="author">(ঐচ্ছিক)</span></label>
                <Field icon={<IcoMail />} type="email" autoComplete="email" warn={signupErr.email?.message} placeholder="name@email.com" {...signupForm.register("email", { validate: (v) => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || "সঠিক ইমেইল দিন", onChange: () => signupForm.clearErrors("email") })} />
                <label>পাসওয়ার্ড</label>
                <Field icon={<IcoLock />} type="password" autoComplete="new-password" warn={signupErr.password?.message} placeholder="পাসওয়ার্ড" {...signupForm.register("password", { required: "পাসওয়ার্ড দিন", onChange: () => signupForm.clearErrors("password") })} />
                <button className="btn btn-primary btn-wide" style={{ marginTop: 14 }} type="submit">অ্যাকাউন্ট খুলুন</button>
              </>
            )}
            <button className="btn btn-ghost btn-wide" style={{ marginTop: 8 }} type="button" onClick={close}>বন্ধ</button>
          </form>
        )}
      </div>
    </div>
  );
}
