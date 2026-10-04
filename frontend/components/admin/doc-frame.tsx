"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { useDocumentHtml } from "@/lib/api/admin/documents";
import { Ico, Modal } from "@/components/admin/ui";
import { printHtml } from "@/lib/admin/print";

/** The paper inside our modal: no in-page print button, no grey page margin. */
const EMBED_CSS = "<style>.print{display:none!important}html,body{background:#fff!important;margin:0!important}.sheet{box-shadow:none!important;margin:0 auto!important}</style>";

function embed(html: string) {
  return html.includes("</head>") ? html.replace("</head>", `${EMBED_CSS}</head>`) : EMBED_CSS + html;
}

/**
 * Renders a server-generated document (invoice / receipt / credit note) in a
 * sandboxed iframe sized to its content. The HTML is fetched with the Bearer
 * token, so it cannot be a plain `src=` link.
 */
export function DocFrame({ id, height }: { id: string; height?: number }) {
  const q = useDocumentHtml(id);
  const ref = useRef<HTMLIFrameElement>(null);
  const [auto, setAuto] = useState<number | null>(null);
  const fit = useCallback(() => {
    const d = ref.current?.contentDocument;
    if (d?.body) setAuto(Math.ceil(d.documentElement.scrollHeight) + 2);
  }, []);
  if (q.isLoading) return <div className="ap-doc-frame loading">কাগজ লোড হচ্ছে…</div>;
  if (q.isError || !q.data) return <div className="ap-doc-frame error">কাগজটি লোড করা যায়নি</div>;
  return (
    <div className="ap-doc-frame">
      <iframe ref={ref} title="document" srcDoc={embed(q.data)} sandbox="allow-same-origin" onLoad={fit} style={{ height: auto ?? height ?? 620 }} />
    </div>
  );
}

/**
 * Invoice / receipt / credit-note viewer — same layout as the pick list:
 * title + sub, the paper, and a footer with বন্ধ / প্রিন্ট.
 */
export function DocModal({ doc, onClose, title, sub }: { doc: { id: string } | null; onClose: () => void; title?: ReactNode; sub?: ReactNode }) {
  const q = useDocumentHtml(doc?.id ?? "");
  return (
    <Modal
      open={!!doc}
      onClose={onClose}
      width={720}
      title={title}
      sub={sub}
      footer={
        <>
          <button type="button" className="ap-btn ghost" onClick={onClose}>বন্ধ</button>
          <button type="button" className="ap-btn primary" disabled={!q.data} onClick={() => q.data && printHtml(q.data, typeof title === "string" ? title : "Cholo")}>
            {Ico.print}প্রিন্ট
          </button>
        </>
      }
    >
      {doc ? <DocFrame id={doc.id} /> : null}
    </Modal>
  );
}
