"use client";

import { useRef } from "react";
import { useDocumentHtml } from "@/lib/api/admin/documents";
import { Ico } from "@/components/admin/ui";

/**
 * Renders a server-generated document (invoice / receipt / credit note) in a
 * sandboxed iframe. The HTML is fetched with the Bearer token, so it cannot be
 * a plain `src=` link.
 */
export function DocFrame({ id, height = 640, printable = true }: { id: string; height?: number; printable?: boolean }) {
  const q = useDocumentHtml(id);
  const ref = useRef<HTMLIFrameElement>(null);
  if (q.isLoading) return <div className="ap-doc-frame loading" style={{ minHeight: 160, display: "grid", placeItems: "center", color: "var(--ap-muted, #8a7a70)" }}>কাগজ লোড হচ্ছে…</div>;
  if (q.isError || !q.data) return <div className="ap-doc-frame error" style={{ padding: 16 }}>কাগজটি লোড করা যায়নি</div>;
  return (
    <div className="ap-doc-frame">
      {printable ? (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button type="button" className="ap-btn sm" onClick={() => ref.current?.contentWindow?.print()}>{Ico.print}প্রিন্ট</button>
        </div>
      ) : null}
      <iframe ref={ref} title="document" srcDoc={q.data} sandbox="allow-same-origin allow-modals" style={{ width: "100%", height, border: "1px solid var(--ap-line, #eadfd6)", borderRadius: 12, background: "#fff" }} />
    </div>
  );
}
