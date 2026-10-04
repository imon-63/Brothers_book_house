"use client";

import { useAdminNav } from "@/components/admin/nav";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { bn, timeAgo, localPhone } from "@/lib/format";
import { statusLabel, statusTone } from "@/lib/admin/status";
import { ms } from "@/lib/api/admin/core";
import {
  useCannedReplies, useConversationAction, useConversations, useMarkThreadRead, useSendReply, useSupportStream, useThread, type Conversation,
} from "@/lib/api/admin/support";
import { TabMark } from "@/components/admin/shared";
const QUICK_REPLIES = ["আসসালামু আলাইকুম, কীভাবে সাহায্য করতে পারি?", "আপনার অর্ডার আইডিটা দিন, দেখে জানাচ্ছি।", "ঢাকায় ১-২ দিন, বাইরে ২-৪ দিনে ডেলিভারি।", "বইটি স্টকে আছে, অর্ডার করতে পারেন।", "ধন্যবাদ! আর কিছু লাগলে জানাবেন।"];

function clock(t: number) {
  return t ? new Date(t).toLocaleTimeString("bn-BD", { hour: "numeric", minute: "2-digit" }) : "";
}
const PILL: Record<string, string> = { hold: "hold", bad: "bad", done: "done", ship: "live", live: "live" };

export function ChatTab() {
  const { focus, clearFocus, go } = useAdminNav();
  useSupportStream();
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "new">("all");
  const listQ = useConversations({ q: q.trim() || undefined });
  const chats: Conversation[] = listQ.data?.items ?? [];
  const [id, setId] = useState("");
  useEffect(() => {
    if (!focus) return;
    const hit = chats.find((c) => c.id === focus || c.customer?.id === focus);
    if (hit) { setId(hit.id); clearFocus(); }
    else if (listQ.isFetched) clearFocus();
  }, [focus, chats, clearFocus, listQ.isFetched]);
  const replyForm = useForm({ defaultValues: { text: "" } });
  const cannedQ = useCannedReplies();
  const quick = cannedQ.data?.length ? cannedQ.data.map((r) => r.body) : QUICK_REPLIES;
  const isNew = (c: Conversation) => c.needsReply;
  const list = chats.filter((c) => only === "all" || isNew(c));
  const newN = chats.filter(isNew).length;
  const curId = id && chats.some((c) => c.id === id) ? id : chats[0]?.id ?? "";
  const threadQ = useThread(curId || null);
  const thread = threadQ.data && threadQ.data.id === curId ? threadQ.data : null;
  const curRow = chats.find((c) => c.id === curId);
  const cur = curRow ? { id: curRow.id, name: thread?.name ?? curRow.name, msgs: (thread?.messages ?? []).map((m) => ({ from: m.sender === "STAFF" ? "agent" : "user", text: m.body, t: ms(m.createdAt), system: m.sender === "SYSTEM" })) } : undefined;
  const who = thread?.customer ?? null;
  const theirs = who?.recentOrders ?? [];
  const spent = who?.totalSpent ?? 0;
  const sendM = useSendReply();
  const readM = useMarkThreadRead();
  const actM = useConversationAction();

  useEffect(() => {
    if (curRow && curRow.unread > 0) readM.mutate({ id: curRow.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curRow?.id, curRow?.unread]);

  useEffect(() => {
    const box = document.querySelector(".adm .chat-msgs");
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [cur?.id, cur?.msgs.length]);

  function send(text: string) {
    if (!cur || !text.trim()) return;
    sendM.mutate({ id: cur.id, body: text.trim() });
  }

  if (!chats.length && !q) {
    return (
      <div className="chat-empty-state">
        <span className="chat-empty-ico"><TabMark id="chat" /></span>
        <h3>{listQ.isLoading ? "লোড হচ্ছে…" : "ইনবক্স একদম খালি"}</h3>
        <p>ক্রেতা সাইটের নিচের চ্যাট বাটন থেকে লিখলে এখানে সাথে সাথে চলে আসবে।</p>
      </div>
    );
  }

  return (
    <div className={`chat-desk chat-desk-3${who ? "" : " no-info"}`}>
      <div className="chat-list">
        <div className="chat-list-head">
          <div className="chat-list-title"><b>ইনবক্স</b>{newN ? <em>{bn(newN)} নতুন</em> : <small>সব পড়া</small>}</div>
          <div className="chat-find">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="নাম বা বার্তা খুঁজুন" />
          </div>
          <div className="chat-seg">
            <button type="button" className={only === "all" ? "on" : ""} onClick={() => setOnly("all")}>সব · {bn(chats.length)}</button>
            <button type="button" className={only === "new" ? "on" : ""} onClick={() => setOnly("new")}>নতুন · {bn(newN)}</button>
          </div>
        </div>
        <div className="chat-list-body">
          {list.map((c) => (
            <button key={c.id} type="button" className={`${c.id === cur?.id ? "on" : ""}${isNew(c) ? " unread" : ""}`} onClick={() => setId(c.id)}>
              <span className="chat-ava">{c.name.trim().slice(0, 1) || "গ"}{c.registered ? <i className="chat-dot" /> : null}</span>
              <span className="chat-li">
                <b><span>{c.name}</span><time>{c.last ? timeAgo(ms(c.last.at)) : ""}</time></b>
                <span className="author">{c.last?.sender === "STAFF" ? "আপনি: " : ""}{c.last?.preview}</span>
              </span>
            </button>
          ))}
          {!list.length ? <p className="chat-none">কিছু মেলেনি</p> : null}
        </div>
      </div>

      <div className="chat-thread">
        {cur ? (
          <div className="chat-top">
            <span className="chat-ava">{cur.name.trim().slice(0, 1) || "গ"}</span>
            <div><b>{cur.name}</b><small>{who?.registered ? <><i className="chat-dot inline" /> নিবন্ধিত ক্রেতা</> : "গেস্ট"} · {bn(cur.msgs.length)}টি বার্তা{curRow?.status === "RESOLVED" || curRow?.status === "CLOSED" ? " · সমাধান হয়েছে" : ""}</small></div>
            {curRow && (curRow.status === "OPEN" || curRow.status === "PENDING")
              ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => actM.mutate({ id: curRow.id, action: "resolve" })}>সমাধান হয়েছে</button>
              : curRow ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => actM.mutate({ id: curRow.id, action: "reopen" })}>আবার খুলুন</button> : null}
            {who?.phone ? <a className="chat-call" href={`tel:${who.phone}`} aria-label="কল করুন"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7.2 3.8h2.6l1.2 3-1.7 1.2a12 12 0 0 0 5.7 5.7l1.2-1.7 3 1.2v2.6c0 .8-.7 1.5-1.5 1.5C9.8 17.3 6.7 8.2 6.7 5.3c0-.8.7-1.5 1.5-1.5z" /></svg></a> : null}
          </div>
        ) : null}
        <div className="chat-msgs">
          <p className="chat-day"><span>কথোপকথন শুরু</span></p>
          {(cur?.msgs || []).map((m, i) => (
            <div key={`${cur?.id}-${i}`} className={`chat-bub ${m.from}`} style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
              <div>{m.text}</div>
              {m.t ? <time>{clock(m.t)}{m.from === "agent" ? " · ✓✓" : ""}</time> : null}
            </div>
          ))}
        </div>
        {cur ? (
          <>
            <div className="chat-quick-row">
              {quick.map((t) => <button key={t} type="button" onClick={() => send(t)}>{t}</button>)}
            </div>
            <form className="chat-form" onSubmit={replyForm.handleSubmit(({ text }) => { send(text); replyForm.reset(); })}>
              <input {...replyForm.register("text")} placeholder={`${cur.name}-কে জবাব লিখুন...`} autoComplete="off" />
              <button className="send" type="submit" aria-label="পাঠান">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 12 20 4l-6 16-3-7z" /></svg>
              </button>
            </form>
          </>
        ) : null}
      </div>

      {who ? (
        <aside className="chat-info">
          <span className="chat-ava lg">{who.name.trim().slice(0, 1)}</span>
          <h4>{who.name}</h4>
          <p className="chat-info-sub">চলো ক্রেতা</p>
          <div className="chat-info-rows">
            {who.phone ? <p><i>মোবাইল</i><b>{localPhone(who.phone)}</b></p> : null}
            {who.email ? <p><i>ইমেইল</i><b>{who.email}</b></p> : null}
          </div>
          <div className="chat-info-kpis">
            <div><b>{bn(theirs.length)}</b><small>অর্ডার</small></div>
            <div><b>৳{bn(spent)}</b><small>মোট কেনা</small></div>
          </div>
          {theirs.length ? (
            <div className="chat-info-orders">
              <small>সাম্প্রতিক অর্ডার</small>
              {theirs.slice(0, 3).map((o) => (
                <p key={o.id}><button type="button" className="chat-order-link" style={{ all: "unset", cursor: "pointer" }} onClick={() => go("orders", o.orderNo)}><b>{o.orderNo}</b></button><span className={`st-pill ${PILL[statusTone(o.status)]}`}>{statusLabel(o.status)}</span></p>
              ))}
            </div>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
