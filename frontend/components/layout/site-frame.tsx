"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { AlsoStrip } from "@/components/catalog/like-strip";
import { PackSpines } from "@/components/catalog/pack-card";
import { bn } from "@/lib/format";
import { ApiError, post } from "@/lib/api/client";
import { login, register as registerAccount, useMe, STAFF_ROLES } from "@/lib/api/auth";
import { cartApi, cartKey, useCart, useCartActions, useCartRows } from "@/lib/api/cart";
import { shopHref, useProducts } from "@/lib/api/catalog";
import { helplineOf, useHeaderCoupons, useStorefront } from "@/lib/api/content";
import { useSection } from "@/lib/api/section";
import { apiErrorText, useFlushPendingWait, useSupportChat } from "@/lib/api/shop";
import { hydrateUi, setAuth, setBye, setChat, setMenu, setMiniCart, setSection, showToast } from "@/store/slices/ui-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { SearchBox } from "@/components/layout/search-box";
import { IconCart, SectionGlyph } from "@/components/icons";

const SECTION_KEY = "cholo_section";
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
  const beforeCheckout = useRef("/");
  const [ready, setReady] = useState(false);
  const [catsOn, setCatsOn] = useState(false);
  const [navGen, setNavGen] = useState(0);
  const [promo, setPromo] = useState(false);
  const [gate, setGate] = useState<{ name: string; admin: boolean } | null>(null);
  const gateToast = useRef("");
  const vertical = useAppSelector((s) => s.ui.section);
  const prevVert = useRef(vertical);
  const navArmed = useRef(false);
  const menuOpen = useAppSelector((s) => s.ui.menuOpen);
  const miniOpen = useAppSelector((s) => s.ui.miniCartOpen);
  const authOpen = useAppSelector((s) => s.ui.authOpen);
  const chatOpen = useAppSelector((s) => s.ui.chatOpen);
  const toast = useAppSelector((s) => s.ui.toast);
  const bye = useAppSelector((s) => s.ui.bye);
  const lastPress = useRef<{ el: HTMLElement; at: number } | null>(null);
  const { me: user, loading: meLoading, isStaff } = useMe();
  const cartQ = useCart();
  const content = useStorefront().data;
  const coupons = useHeaderCoupons().data ?? [];
  const { section: meta, sections, loading: sectionsLoading } = useSection();
  const chat = useSupportChat(chatOpen);
  const count = cartQ.data?.count ?? cartQ.data?.items.reduce((s2, l) => s2 + l.quantity, 0) ?? 0;
  const coupon = cartQ.data?.couponCode ?? "";
  const tree = meta.tree;
  const ticker = (content?.announcements ?? []).map((a) => a.text);
  const helpline = helplineOf(content?.settings);
  const promoData = content?.promo ?? null;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SECTION_KEY);
      if (saved) dispatch(hydrateUi(saved));
    } catch { /* ignore */ }
    setReady(true);
    try { if (!sessionStorage.getItem("cholo_promo_seen")) setPromo(true); } catch { /* ignore */ }
  }, [dispatch]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(SECTION_KEY, vertical); } catch { /* ignore */ }
  }, [ready, vertical]);

  useEffect(() => {
    document.body.className = document.body.className.split(" ").filter((c) => !c.startsWith("vert-")).join(" ");
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
    if (path.startsWith("/checkout") && !from.startsWith("/checkout")) beforeCheckout.current = from;
    let placed = false;
    try {
      // read only — the orders page consumes (removes) the flag to show its "অর্ডার হয়েছে" banner
      placed = path.startsWith("/orders") && sessionStorage.getItem("cholo_placed") === "1";
    } catch { /* ignore */ }
    const shown = placed ? beforeCheckout.current : from;
    setFromLabel(pageName(shown));
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
    const press = (e: Event) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("button, .btn, label.tog, label.pk-switch");
      if (el) lastPress.current = { el, at: Date.now() };
    };
    const submit = (e: Event) => {
      const el = (e as SubmitEvent).submitter as HTMLElement | null;
      if (el) lastPress.current = { el, at: Date.now() };
    };
    document.addEventListener("click", press, true);
    document.addEventListener("submit", submit, true);
    return () => {
      document.removeEventListener("click", press, true);
      document.removeEventListener("submit", submit, true);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const hit = lastPress.current;
    if (hit && Date.now() - hit.at < 800 && toastTone(toast) === "ok" && hit.el.isConnected) {
      hit.el.classList.remove("btn-ok");
      void hit.el.offsetWidth;
      hit.el.classList.add("btn-ok");
      window.setTimeout(() => hit.el.classList.remove("btn-ok"), 900);
    }
    lastPress.current = null;
    const t = setTimeout(() => dispatch(showToast("")), 2200);
    return () => clearTimeout(t);
  }, [toast, dispatch]);

  /* hidden sections never come back from GET /sections — fall back to the first live one */
  const showVerts = sections;
  useEffect(() => {
    if (!ready || sectionsLoading || !sections.length) return;
    if (!sections.some((x) => x.code === vertical)) dispatch(setSection(sections[0].code));
  }, [ready, sectionsLoading, sections, vertical, dispatch]);

  const isAdmin = isStaff;

  useEffect(() => {
    if (ready && isAdmin && !path.startsWith("/admin")) router.replace("/admin");
  }, [ready, isAdmin, path, router]);

  function pickVertical(id: string) {
    dispatch(setSection(id));
    router.push("/");
  }

  function copyCoupon(code: string) {
    navigator.clipboard?.writeText(code).catch(() => undefined);
    dispatch(showToast(`${code} কপি হয়েছে · চেকআউটে বসান`));
  }

  function closePromo() {
    setPromo(false);
    try { sessionStorage.setItem("cholo_promo_seen", "1"); } catch { /* ignore */ }
  }

  const overlays = (
    <Fragment key="overlays">
      {authOpen ? <AuthModal onEnter={(name, toast, admin) => { gateToast.current = toast; setGate({ name, admin }); }} /> : null}
      {gate ? <LoginGate name={gate.name} admin={gate.admin} onDone={() => { setGate(null); if (gateToast.current) { dispatch(showToast(gateToast.current)); gateToast.current = ""; } }} /> : null}
      <Toast text={toast} />
      {bye != null ? <ByeGate name={bye} onLeave={() => { router.push("/"); }} onDone={() => { dispatch(setBye(null)); dispatch(showToast("লগআউট হয়েছে · আবার আসবেন")); }} /> : null}
    </Fragment>
  );

  if ((!ready || meLoading) && path.startsWith("/admin")) {
    return <div className="adm-boot"><img src="/icons/cholo-mark.svg" alt="চলো" width={64} height={64} /></div>;
  }

  if (isAdmin) {
    return (
      <>
        <main className="adm-root">{path.startsWith("/admin") ? children : <div className="adm-boot"><img src="/icons/cholo-mark.svg" alt="চলো" width={64} height={64} /></div>}</main>
        {overlays}
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-marquee">
          <div className="topbar-track">
            {[0, 1].map((copy) => (
              <div className="topbar-run" key={copy} aria-hidden={copy === 1}>
                {Array.from({ length: 4 }, () => ticker).flat().map((t, i) => <span key={`${copy}-${i}`}>{t}</span>)}
              </div>
            ))}
          </div>
        </div>
        <div className="topbar-fixed">
          হেল্পলাইন: <a href={`tel:${helpline}`}>{helpline}</a>
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
                  <span key={node.slug} style={{ animationDelay: `${80 + i * 36}ms` }}>
                    <Link href={shopHref(node.slug)} onClick={() => setCatsOn(false)}>{node.name}</Link>
                    {node.subs.map((x) => (
                      <Link className="kid" key={x.slug} href={shopHref(node.slug, x.slug)} onClick={() => setCatsOn(false)}>{x.name}</Link>
                    ))}
                  </span>
                ))}
              </div>
            </div>
            <Link className={`book-only${path.startsWith("/packs") || path.startsWith("/pack") ? " active" : ""}`} href="/packs">প্যাকেজ</Link>
            <Link className={`book-only${path.startsWith("/authors") ? " active" : ""}`} href="/authors">লেখক</Link>
            <Link className={path.startsWith("/orders") ? "active" : ""} href={user ? "/orders" : "/track"}>অর্ডার</Link>
            {user && !isStaff ? <Link className={path.startsWith("/wait") ? "active" : ""} href="/wait">ভবিষ্যৎ</Link> : null}
          </nav>
          <div className="nav-tools">
            <div className="nav-cpns">
              {coupons.map((c) => (
                <button key={c.code} type="button" className={`nav-cpn${coupon === c.code ? " on" : ""}`} onClick={() => copyCoupon(c.code)}>
                  <span><code>{c.code}</code><i>{c.type === "PERCENT" ? `${bn(c.value)}% ছাড়` : c.type === "FIXED" ? `৳${bn(c.value)} ছাড়` : "ফ্রি ডেলিভারি"}</i></span>
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
                {isStaff ? <Link className="btn btn-gold btn-sm" href="/admin">অ্যাডমিন</Link> : null}
                <Link className="btn btn-ghost btn-sm" href="/profile">{isStaff ? "প্রোফাইল" : user.name.split(" ")[0]}</Link>
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
                key={v.code}
                type="button"
                className={`vtab${vertical === v.code ? " on" : ""}`}
                onClick={() => pickVertical(v.code)}
              >
                <SectionGlyph code={v.code} icon={v.icon} /> {v.name}
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
              <button key={v.code} type="button" className={`vtab${vertical === v.code ? " on" : ""}`} onClick={() => pickVertical(v.code)}>
                <SectionGlyph code={v.code} icon={v.icon} /> {v.name}
              </button>
            ))}
          </div>
          <nav className={`mnav-links${navGen ? " nav-in" : ""}`} key={`m-${navGen}`}>
            <Link href="/" onClick={() => dispatch(setMenu(false))}>হোম</Link>
            <Link href="/shop" onClick={() => dispatch(setMenu(false))}>ক্যাটাগরি</Link>
            <div className="mnav-cats">
              {tree.map((node, i) => (
                <Link key={node.slug} href={shopHref(node.slug)} style={{ animationDelay: `${60 + i * 32}ms` }} onClick={() => dispatch(setMenu(false))}>{node.name}</Link>
              ))}
            </div>
            <Link className="book-only" href="/packs" onClick={() => dispatch(setMenu(false))}>প্যাকেজ</Link>
            <Link className="book-only" href="/authors" onClick={() => dispatch(setMenu(false))}>লেখক</Link>
            <Link href="/orders" onClick={() => dispatch(setMenu(false))}>অর্ডার</Link>
            {user && !isStaff ? <Link href="/wait" onClick={() => dispatch(setMenu(false))}>ভবিষ্যৎ অর্ডার</Link> : null}
            <Link href="/track" onClick={() => dispatch(setMenu(false))}>অর্ডার খুঁজুন</Link>
            <button type="button" onClick={() => { dispatch(setMenu(false)); dispatch(setMiniCart(true)); }}>কার্ট</button>
          </nav>
          <p className="mnav-help">হেল্পলাইন <a href={`tel:${helpline}`}>{helpline}</a></p>
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
            {isStaff ? null : <Link href="/wait">ভবিষ্যৎ অর্ডার</Link>}
            <Link href="/track">অর্ডার খুঁজুন</Link>
          </div>
          <div>
            <h4>হেল্পলাইন</h4>
            <p><a href={`tel:${helpline}`}>{helpline}</a></p>
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
            <a className="wa" href={`https://wa.me/${String(content?.settings?.whatsapp || helpline).replace(/\D/g, "").replace(/^0/, "880")}`} target="_blank" rel="noopener" aria-label="হোয়াটসঅ্যাপ">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.5 2 2 6.37 2 11.76c0 1.72.46 3.4 1.34 4.88L2 22l5.54-1.45A10.2 10.2 0 0 0 12.04 21.5C17.58 21.5 22.1 17.13 22.1 11.74 22.08 6.37 17.56 2 12.04 2z" /></svg>
            </a>
            <a className="call" href={`tel:${helpline}`} aria-label="কল">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7.2 3.8h2.6l1.2 3-1.7 1.2a12 12 0 0 0 5.7 5.7l1.2-1.7 3 1.2v2.6c0 .8-.7 1.5-1.5 1.5C9.8 17.3 6.7 8.2 6.7 5.3c0-.8.7-1.5 1.5-1.5z" /></svg>
            </a>
            <button type="button" aria-label="বন্ধ" onClick={() => dispatch(setChat(false))}>×</button>
          </div>
        </div>
        <div className="chat-msgs">
          <div className="chat-bub agent">আসসালামু আলাইকুম। কীভাবে সাহায্য করতে পারি?</div>
          {chat.messages.map((m) => <div key={m.id} className={`chat-bub ${m.sender === "CUSTOMER" ? "user" : "agent"}`}>{m.body}</div>)}
        </div>
        {chat.messages.length < 3 ? (
          <div className="chat-quick">
            {QUICK.map((t) => (
              <button key={t} type="button" onClick={() => { chat.send(t, user?.name).catch((e) => dispatch(showToast(apiErrorText(e)))); }}>{t}</button>
            ))}
          </div>
        ) : null}
        <ChatComposer placeholder="মেসেজ লিখুন..." onSend={(text) => { chat.send(text, user?.name).catch((e) => dispatch(showToast(apiErrorText(e)))); }} />
      </div>
      {promo && promoData ? (
        <div className="overlay on" onClick={(e) => { if (e.target === e.currentTarget) closePromo(); }}>
          <div className="promo-card">
            <button className="x" type="button" aria-label="বন্ধ" onClick={closePromo}>×</button>
            <div className="promo-art">{promoData.imageUrl ? <img src={promoData.imageUrl} alt="" /> : <b>{promoData.title}</b>}</div>
            <div className="body">
              <h3>{promoData.title}</h3>
              <p>{promoData.body}</p>
              {promoData.coupon ? <p><button type="button" className="nav-cpn" onClick={() => copyCoupon(promoData.coupon!.code)}><span><code>{promoData.coupon.code}</code></span></button></p> : null}
              <Link className="btn btn-primary btn-wide" href={promoData.ctaUrl || "/shop"} onClick={closePromo}>{promoData.ctaLabel || "ক্যাটালগ দেখুন"}</Link>
            </div>
          </div>
        </div>
      ) : null}
      {overlays}
    </>
  );
}

function MiniCart({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const vertical = useAppSelector((s) => s.ui.section);
  const cartQ = useCart();
  const actions = useCartActions();
  const rows = useCartRows(cartQ.data).map((r) => ({ ...r, id: r.itemId }));
  const lines = rows;
  const n = rows.reduce((s2, r) => s2 + r.n, 0);
  const sub = cartQ.data?.quote?.itemsSubtotal ?? rows.reduce((s2, r) => s2 + r.price * r.n, 0);
  const total = cartQ.data?.quote ? cartQ.data.quote.itemsSubtotal - cartQ.data.quote.discountTotal : sub;
  const taken = new Set(rows.filter((l) => l.kind === "book").map((l) => l.refId));
  const alsoQ = useProducts({ section: vertical, sort: "popular", inStock: true, pageSize: 12 }, open);
  let also = (alsoQ.data?.items ?? []).filter((p) => !taken.has(p.id));
  while (also.length && also.length < 6) also = also.concat(also);
  also = also.slice(0, 8);
  const setQty = (itemId: string, next: number) => actions.setQty(itemId, next).catch((e) => dispatch(showToast(apiErrorText(e))));

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
            <article className="cart-row" key={r.itemId}>
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
                    <button type="button" aria-label="কমান" onClick={() => setQty(r.itemId, r.n - 1)}>−</button>
                    <span>{bn(r.n)}</span>
                    <button type="button" aria-label="বাড়ান" onClick={() => setQty(r.itemId, r.n + 1)}>+</button>
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
                  void setQty(r.itemId, 0).then(() => dispatch(showToast("কার্ট থেকে সরানো হয়েছে")));
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
            {total !== sub ? <div className="row"><span>ছাড়</span><span>−৳{bn(sub - total)}</span></div> : null}
            <div className="row total"><span>মোট</span><span>৳{bn(total)}</span></div>
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

function toastTone(text: string): "ok" | "warn" | "off" {
  if (/(দিন|ভুল|নেই|পারবেন না|আগে |অন্তত|কম দিন|পাওয়া যায়নি)/.test(text) && !/(হয়েছে|বসেছে|সেভ)/.test(text)) return "warn";
  if (/(মুছে|সরানো|সরান|লুকানো|লগআউট|বাতিল)/.test(text)) return "off";
  return "ok";
}

function Toast({ text }: { text: string }) {
  const [cur, setCur] = useState("");
  const [out, setOut] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (text) {
      setCur(text);
      setOut(false);
      setN((k) => k + 1);
      return;
    }
    setOut(true);
    const t = window.setTimeout(() => setCur(""), 320);
    return () => window.clearTimeout(t);
  }, [text]);
  if (!cur) return null;
  const tone = toastTone(cur);
  return (
    <div className={`toast show t-${tone}${out ? " out" : ""}`} key={n} role="status" aria-live="polite">
      <span className="t-ico" aria-hidden="true">
        {tone === "ok" ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path className="t-tick" d="M5 12.5 10 17.5 19 7.5" /></svg>
        ) : tone === "warn" ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 7v6" /><path d="M12 17h.01" /></svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 12h12" /></svg>
        )}
      </span>
      <span className="t-txt">{cur}</span>
      <i className="t-bar" aria-hidden="true" />
    </div>
  );
}

function ByeGate({ name, onLeave, onDone }: { name: string; onLeave: () => void; onDone: () => void }) {
  const [phase, setPhase] = useState<"in" | "out">("in");
  const leave = useRef(onLeave);
  const done = useRef(onDone);
  leave.current = onLeave;
  done.current = onDone;
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const a = window.setTimeout(() => leave.current(), reduce ? 120 : 900);
    const b = window.setTimeout(() => setPhase("out"), reduce ? 260 : 1500);
    const c = window.setTimeout(() => done.current(), reduce ? 500 : 1950);
    return () => { window.clearTimeout(a); window.clearTimeout(b); window.clearTimeout(c); };
  }, []);
  return (
    <div className={`bye-gate${phase === "out" ? " bye" : ""}`} role="status" aria-live="polite" aria-label="লগআউট হচ্ছে">
      <div className="bye-stage">
        <div className="bye-mark">
          <img src="/icons/cholo-mark.svg" alt="" width={84} height={84} />
          <span className="bye-wave" aria-hidden="true">👋</span>
        </div>
        <small>চলো</small>
        <h2>আবার দেখা হবে{name ? `, ${name}` : ""}</h2>
        <p>নিরাপদে লগআউট হচ্ছে…</p>
        <div className="bye-dots" aria-hidden="true"><i /><i /><i /></div>
      </div>
    </div>
  );
}

function LoginGate({ name, admin, onDone }: { name: string; admin?: boolean; onDone: () => void }) {
  const [bye, setBye] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = window.setTimeout(() => setBye(true), reduce ? 280 : admin ? 2100 : 1680);
    const end = window.setTimeout(() => doneRef.current(), reduce ? 520 : admin ? 2600 : 2140);
    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(end);
    };
  }, [admin]);
  return (
    <div className={`land-gate${admin ? " admin" : ""}${bye ? " bye" : ""}`} role="status" aria-live="polite" aria-label={`স্বাগতম, ${name}`}>
      <span className="land-rays" aria-hidden="true" />
      <span className="land-sparks" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ["--i" as string]: i }} />)}</span>
      <div className="land-stage">
        <div className="land-mark">
          <span className="land-orbit" />
          <span className="land-orbit two" />
          <img src="/icons/cholo-mark.svg" alt="" width={92} height={92} />
          {admin ? <span className="land-crown" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" /></svg></span> : null}
        </div>
        <div className="land-copy">
          <small>{admin ? "চলো · অ্যাডমিন ডেস্ক" : "চলো"}</small>
          <h2>স্বাগতম, {name}</h2>
          <p>{admin ? "আপনার ডেস্ক প্রস্তুত হচ্ছে…" : "চলো, কিনে ফেলি"}</p>
          <div className="land-bar" aria-hidden="true"><i /></div>
        </div>
      </div>
    </div>
  );
}

function AuthModal({ onEnter }: { onEnter: (name: string, toast: string, admin: boolean) => void }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const qc = useQueryClient();
  const flushWait = useFlushPendingWait();
  const [view, setView] = useState<"login" | "signup" | "reset">("login");
  const [motion, setMotion] = useState<"" | "to-signup" | "to-login">("");
  const [busy, setBusy] = useState(false);
  const swapRef = useRef<HTMLDivElement>(null);
  const lockH = useRef<number | null>(null);
  const loginForm = useForm<LoginValues>({ defaultValues: { id: "", password: "" } });
  const signupForm = useForm<SignupValues>({ defaultValues: { name: "", phone: "", email: "", password: "" } });
  const resetForm = useForm<ResetValues>({ defaultValues: { id: "", code: "", password: "" } });

  function close() { dispatch(setAuth(false)); }
  function go(next: "login" | "signup" | "reset") {
    if (next === view) return;
    const swapping = (view === "login" && next === "signup") || (view === "signup" && next === "login");
    if (swapping && swapRef.current) {
      lockH.current = swapRef.current.offsetHeight;
      setMotion(next === "signup" ? "to-signup" : "to-login");
    } else {
      lockH.current = null;
      setMotion("");
    }
    setView(next);
    loginForm.clearErrors();
    signupForm.clearErrors();
    resetForm.clearErrors();
  }

  useLayoutEffect(() => {
    const el = swapRef.current;
    const from = lockH.current;
    lockH.current = null;
    if (!el || from == null) return;
    const to = el.scrollHeight;
    el.style.height = `${from}px`;
    const frame = requestAnimationFrame(() => {
      el.style.height = `${to}px`;
    });
    const done = (e: TransitionEvent) => {
      if (e.propertyName !== "height") return;
      el.style.height = "";
    };
    el.addEventListener("transitionend", done);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("transitionend", done);
    };
  }, [view]);

  /** Guest cart → customer cart, pending wishlist item, fresh queries. */
  async function afterAuth(name: string, staff: boolean) {
    if (!staff) {
      try { await cartApi.merge(); } catch { /* keep going */ }
    }
    await qc.invalidateQueries({ queryKey: cartKey });
    const kept = staff ? false : await flushWait();
    close();
    onEnter(name.split(" ")[0] || "চলো", kept ? "ভবিষ্যৎ অর্ডারে রাখা হয়েছে" : "", staff);
    if (staff) router.push("/admin");
  }

  async function onLogin(values: LoginValues) {
    const who = bnDigits(values.id.trim());
    setBusy(true);
    try {
      const me = await login(who, values.password);
      await afterAuth(me.name, STAFF_ROLES.includes(me.role));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 400)) loginForm.setError("password", { message: e.status === 401 ? "ইমেইল/ফোন বা পাসওয়ার্ড ভুল" : apiErrorText(e) });
      else if (e instanceof ApiError && e.status === 404) loginForm.setError("id", { message: "এই ইমেইল বা ফোনে অ্যাকাউন্ট নেই" });
      else loginForm.setError("password", { message: apiErrorText(e) });
    } finally { setBusy(false); }
  }

  async function onSignup(values: SignupValues) {
    const who = values.name.trim();
    const mobile = bnDigits(values.phone.trim());
    const mail = values.email.trim();
    if (values.password.length < 8) { signupForm.setError("password", { message: "পাসওয়ার্ড অন্তত ৮ অক্ষর" }); return; }
    setBusy(true);
    try {
      const me = await registerAccount({ name: who, phone: mobile, email: mail || undefined, password: values.password });
      await afterAuth(me.name || who, false);
    } catch (e) {
      const msg = apiErrorText(e);
      if (/ফোন|phone|নম্বর/i.test(msg)) signupForm.setError("phone", { message: msg });
      else if (/ইমেইল|email/i.test(msg)) signupForm.setError("email", { message: msg });
      else signupForm.setError("password", { message: msg });
    } finally { setBusy(false); }
  }

  async function sendCode() {
    const who = bnDigits(resetForm.getValues("id").trim());
    if (!who) { resetForm.setError("id", { message: "ইমেইল অথবা মোবাইল দিন" }); return; }
    try {
      await post("/auth/password/forgot", { identifier: who }, { auth: false });
      dispatch(showToast("কোড পাঠানো হয়েছে · ইমেইল/SMS দেখুন"));
    } catch (e) {
      dispatch(showToast(apiErrorText(e)));
    }
  }

  async function onReset(values: ResetValues) {
    const who = bnDigits(values.id.trim());
    const token = bnDigits(values.code.trim());
    if (values.password.length < 8) { resetForm.setError("password", { message: "পাসওয়ার্ড অন্তত ৮ অক্ষর" }); return; }
    setBusy(true);
    try {
      await post("/auth/password/reset", { identifier: who, code: token, password: values.password }, { auth: false });
      dispatch(showToast("পাসওয়ার্ড বদলেছে · এবার লগইন করুন"));
      resetForm.reset({ id: who, code: "", password: "" });
      loginForm.reset({ id: who, password: "" });
      go("login");
    } catch (e) {
      resetForm.setError("code", { message: apiErrorText(e) });
    } finally { setBusy(false); }
  }

  const loginErr = loginForm.formState.errors;
  const signupErr = signupForm.formState.errors;
  const resetErr = resetForm.formState.errors;

  return (
    <div className="overlay on" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal auth-modal">
        <div className="auth-head">
          <button className="auth-x" type="button" aria-label="বন্ধ" onClick={close}>×</button>
          <img src="/icons/cholo-mark.svg" alt="চলো" width={56} height={56} />
          <div>
            <small>চলো · কিনে ফেলি</small>
            <h2>{view === "reset" ? "পাসওয়ার্ড রিসেট" : view === "signup" ? "নতুন অ্যাকাউন্ট" : "আবার স্বাগতম"}</h2>
            <p>{view === "reset" ? "কোড দিয়ে নতুন পাসওয়ার্ড সেট করুন" : view === "signup" ? "এক মিনিটে অ্যাকাউন্ট খুলুন" : "লগইন করে অর্ডার ও অফার দেখুন"}</p>
          </div>
        </div>
        <div className="auth-body">
        {view === "reset" ? (
          <form onSubmit={resetForm.handleSubmit(onReset)} noValidate>
            <p className="author" style={{ marginBottom: 10 }}>ইমেইল অথবা ফোনে একটি কোড যাবে</p>
            <label>ইমেইল অথবা মোবাইল</label>
            <Field icon={<IcoMail />} autoComplete="username" warn={resetErr.id?.message} placeholder="ইমেইল বা ফোন" {...resetForm.register("id", { required: "ইমেইল অথবা মোবাইল দিন", onChange: () => resetForm.clearErrors("id") })} />
            <button className="btn btn-gold btn-wide" style={{ margin: "10px 0" }} type="button" onClick={() => void sendCode()}>কোড পাঠান</button>
            <label>কোড</label>
            <Field icon={<IcoTicket />} warn={resetErr.code?.message} placeholder="৬ অঙ্কের কোড" {...resetForm.register("code", { required: "কোড দিন", onChange: () => resetForm.clearErrors("code") })} />
            <label>নতুন পাসওয়ার্ড</label>
            <Field icon={<IcoLock />} type="password" autoComplete="new-password" warn={resetErr.password?.message} placeholder="নতুন পাসওয়ার্ড" {...resetForm.register("password", { required: "নতুন পাসওয়ার্ড দিন", onChange: () => resetForm.clearErrors("password") })} />
            <button className="btn btn-primary btn-wide" style={{ marginTop: 14 }} type="submit" disabled={busy}>সেট করুন</button>
            <button className="btn btn-ghost btn-wide" style={{ marginTop: 8 }} type="button" onClick={() => go("login")}>লগইনে ফিরুন</button>
          </form>
        ) : (
          <form onSubmit={view === "login" ? loginForm.handleSubmit(onLogin) : signupForm.handleSubmit(onSignup)} noValidate>
            <div className={`tabs auth-tabs${view === "signup" ? " sign" : ""}`}>
              <i className="glide" aria-hidden="true" />
              <button type="button" className={view === "login" ? "on" : ""} onClick={() => go("login")}>লগইন</button>
              <button type="button" className={view === "signup" ? "on" : ""} onClick={() => go("signup")}>সাইন আপ</button>
            </div>
            <div ref={swapRef} className={`auth-swap${motion ? ` ${motion}` : ""}`}>
            <div className="auth-pane" key={view}>
            {view === "login" ? (
              <>
                <div className="auth-demo">
                  <span>ডেমো অ্যাকাউন্ট · চাপ দিলেই পূরণ হবে</span>
                  <div>
                    <button type="button" onClick={() => { loginForm.reset({ id: "rafi@gmail.com", password: "123456" }); }}>
                      <b>ইউজার</b><small>rafi@gmail.com</small>
                    </button>
                    <button type="button" className="adm-demo" onClick={() => { loginForm.reset({ id: "admin@cholo.shop", password: "admin123" }); }}>
                      <b>অ্যাডমিন</b><small>admin@cholo.shop</small>
                    </button>
                  </div>
                </div>
                <label>ইমেইল অথবা মোবাইল</label>
                <Field icon={<IcoMail />} autoComplete="username" warn={loginErr.id?.message} placeholder="ইমেইল বা 01xxxxxxxxx" {...loginForm.register("id", { required: "ইমেইল অথবা মোবাইল দিন", onChange: () => loginForm.clearErrors("id") })} />
                <label>পাসওয়ার্ড</label>
                <Field icon={<IcoLock />} type="password" autoComplete="current-password" warn={loginErr.password?.message} placeholder="পাসওয়ার্ড" {...loginForm.register("password", { required: "পাসওয়ার্ড দিন", onChange: () => loginForm.clearErrors("password") })} />
                <p style={{ margin: "10px 0" }}><a href="#" onClick={(e) => { e.preventDefault(); go("reset"); }}>পাসওয়ার্ড ভুলে গেছেন?</a></p>
                <button className="btn btn-primary btn-wide" type="submit" disabled={busy}>{busy ? "প্রবেশ হচ্ছে…" : "প্রবেশ"}</button>
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
                <Field icon={<IcoLock />} type="password" autoComplete="new-password" warn={signupErr.password?.message} placeholder="অন্তত ৮ অক্ষর" {...signupForm.register("password", { required: "পাসওয়ার্ড দিন", onChange: () => signupForm.clearErrors("password") })} />
                <button className="btn btn-primary btn-wide" style={{ marginTop: 14 }} type="submit" disabled={busy}>অ্যাকাউন্ট খুলুন</button>
              </>
            )}
            </div>
            </div>
          </form>
        )}
        </div>
      </div>
    </div>
  );
}
