/**
 * Print through a hidden, *unsandboxed* iframe so the browser opens its full
 * print dialog (system printers + Save as PDF). Printing from a sandboxed
 * iframe, or calling window.print() on the admin page itself, can leave only
 * "Save as PDF" and prints the whole screen.
 */
export function printHtml(html: string, title = "Cholo") {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(frame);
  const cleanup = () => window.setTimeout(() => frame.remove(), 1000);
  frame.onload = () => {
    const w = frame.contentWindow;
    if (!w) return cleanup();
    w.document.title = title;
    w.onafterprint = cleanup;
    // let fonts/images settle before the dialog snapshots the page
    window.setTimeout(() => {
      w.focus();
      w.print();
      window.setTimeout(cleanup, 60_000);
    }, 250);
  };
  frame.srcdoc = html;
}

/** Print one element with the app's current stylesheets (e.g. a pick list inside a modal). */
export function printElement(el: HTMLElement, title = "Cholo") {
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join("\n");
  const base = `<base href="${location.origin}/">`;
  printHtml(
    `<!doctype html><html lang="bn"><head><meta charset="utf-8">${base}${styles}<style>body{background:#fff;margin:16px;} .adm{background:#fff}</style></head><body><div class="adm">${el.outerHTML}</div></body></html>`,
    title,
  );
}
