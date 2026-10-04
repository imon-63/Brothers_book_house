import type { DocumentKind } from '@prisma/client';
import { D, type MoneyLike } from '@/common/utils/money';
import { localPhone } from '@/common/utils/text';
import { bnDateTime, bnDigits, bnTaka, isZero } from '../../shared/domain/bn-format';
import type { DocLine } from './document-snapshot';

export type PrintableDocument = {
  kind: DocumentKind;
  docNo: string;
  orderNo: string;
  issuedAt: Date;
  paymentLabel: string;
  paymentMethod: string;
  customerName: string;
  customerPhone: string;
  address: string;
  lines: DocLine[];
  subtotal: MoneyLike;
  couponCode: string | null;
  discount: MoneyLike;
  shippingFee: MoneyLike;
  taxTotal: MoneyLike;
  total: MoneyLike;
  gatewayFee: MoneyLike;
  reason: string | null;
  courierLoss: MoneyLike | null;
  reverseCourier: boolean;
  creditsDocNo?: string | null;
};

export const DOC_TITLE: Record<DocumentKind, string> = { INVOICE: 'ইনভয়েস', RECEIPT: 'রিসিট', CREDIT_NOTE: 'ক্রেডিট নোট' };

export function escapeHtml(s: string | null | undefined): string {
  return (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

const CSS = `
*{box-sizing:border-box}body{margin:0;background:#f4f1ec;font-family:"Hind Siliguri","Noto Sans Bengali",system-ui,sans-serif;color:#1f1a17}
.sheet{max-width:760px;margin:24px auto;background:#fff;padding:32px 36px;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.06)}
.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #7a2430;padding-bottom:14px}
.shop b{font-size:26px;color:#7a2430}.shop span{display:block;font-size:13px;color:#8a7f76}
h1{margin:6px 0 0;font-size:20px}.no{font-family:ui-monospace,monospace;font-size:15px;color:#555}
.facts{display:flex;flex-wrap:wrap;gap:18px;margin:16px 0;font-size:14px}.facts i,.who i{display:block;font-style:normal;font-size:12px;color:#8a7f76}
.who{margin:10px 0 18px;font-size:14px}.who b{font-size:16px}.who p{margin:4px 0 0;color:#444}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:8px 6px;border-bottom:1px solid #eee;text-align:left}th{font-size:12px;color:#8a7f76;font-weight:600}
.num{text-align:right;white-space:nowrap}td small{display:block;color:#8a7f76;font-size:11px}
.sum{margin:14px 0 0 auto;max-width:320px;font-size:14px}.sum p{display:flex;justify-content:space-between;margin:6px 0}.sum .grand{font-size:17px;border-top:1px solid #ddd;padding-top:8px}
.note{margin-top:18px;padding:10px 12px;background:#faf6f0;border-radius:8px;font-size:13px;color:#5b514a}
.print{text-align:right;margin-bottom:10px}.print button{background:#7a2430;color:#fff;border:0;border-radius:8px;padding:8px 14px;font:inherit;cursor:pointer}
@media print{body{background:#fff}.sheet{box-shadow:none;margin:0;max-width:none}.print{display:none}}
`;

/** Printable Bangla invoice / receipt / credit note (port of components/books/paper.tsx). */
export function renderDocumentHtml(doc: PrintableDocument): string {
  const title = DOC_TITLE[doc.kind];
  const rows = doc.lines
    .map((l) => {
      const total = D(l.unitPrice).times(l.qty);
      return `<tr><td><b>${escapeHtml(l.title)}</b><small>${l.kind === 'BUNDLE' ? 'প্যাকেজ' : 'পণ্য'}</small></td><td class="num">${bnDigits(l.qty)}</td><td class="num">${bnTaka(l.unitPrice)}</td><td class="num">${bnTaka(total)}</td></tr>`;
    })
    .join('');

  const sum: string[] = [`<p><span>সাবটোটাল</span><b>${bnTaka(doc.subtotal)}</b></p>`];
  if (!isZero(doc.discount)) sum.push(`<p><span>কুপন ${escapeHtml(doc.couponCode)}</span><b>−${bnTaka(doc.discount)}</b></p>`);
  sum.push(`<p><span>ডেলিভারি</span><b>${isZero(doc.shippingFee) ? 'ফ্রি' : bnTaka(doc.shippingFee)}</b></p>`);
  if (!isZero(doc.taxTotal)) sum.push(`<p><span>ভ্যাট/কর</span><b>${bnTaka(doc.taxTotal)}</b></p>`);
  sum.push(`<p class="grand"><span>মোট</span><b>${bnTaka(doc.total)}</b></p>`);
  if (doc.kind === 'RECEIPT' && !isZero(doc.gatewayFee)) sum.push(`<p><span>গেটওয়ে ফি</span><b>${bnTaka(doc.gatewayFee)}</b></p>`);

  let note = '';
  if (doc.kind === 'INVOICE') {
    note = doc.paymentMethod === 'COD' || doc.paymentMethod === 'CASH'
      ? 'বিক্রির কাগজ। ক্যাশ অন ডেলিভারিতে টাকা পরে আসবে — এটা রিসিট নয়।'
      : 'বিক্রির কাগজ। পেমেন্ট আলাদা রিসিটে।';
  } else if (doc.kind === 'RECEIPT') {
    note = `টাকা পাওয়া গেছে ${bnTaka(doc.total)}।`;
  } else {
    note = `কারণ: ${escapeHtml(doc.reason || 'ফেরত')}। বিক্রি বাতিল, স্টক ফেরত।`;
    if (doc.creditsDocNo) note += ` মূল ইনভয়েস ${escapeHtml(doc.creditsDocNo)}।`;
    if (!isZero(doc.courierLoss)) note += ` কুরিয়ার লস ${bnTaka(doc.courierLoss as MoneyLike)} আলাদা খরচ।`;
    note += doc.reverseCourier ? ' কুরিয়ারে ওঠেনি — কুরিয়ার খরচও উল্টেছে।' : ' কুরিয়ার খরচ থেকে যাচ্ছে।';
  }

  return `<!doctype html>
<html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} ${escapeHtml(doc.docNo)} · চলো</title><style>${CSS}</style></head>
<body><main class="sheet">
<div class="print"><button type="button" onclick="window.print()">প্রিন্ট</button></div>
<div class="head"><div><div class="shop"><b>চলো</b><span>কিনে ফেলি</span></div><h1>${title}</h1></div><p class="no">${escapeHtml(doc.docNo)}</p></div>
<div class="facts"><span><i>তারিখ</i>${escapeHtml(bnDateTime(doc.issuedAt))}</span><span><i>অর্ডার</i>${escapeHtml(doc.orderNo)}</span><span><i>পেমেন্ট</i>${escapeHtml(doc.paymentLabel)}</span></div>
<div class="who"><i>ক্রেতা</i><b>${escapeHtml(doc.customerName)}</b> <span>${escapeHtml(localPhone(doc.customerPhone))}</span>${doc.address ? `<p>${escapeHtml(doc.address)}</p>` : ''}</div>
${rows ? `<table><thead><tr><th>পণ্য</th><th class="num">পরিমাণ</th><th class="num">দাম</th><th class="num">মোট</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
<div class="sum">${sum.join('')}</div>
<p class="note">${note}</p>
</main></body></html>`;
}
