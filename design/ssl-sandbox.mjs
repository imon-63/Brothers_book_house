#!/usr/bin/env node
/**
 * SSLCOMMERZ sandbox helper — no public domain required.
 *
 * SSLCommerz lets sandbox success/fail/cancel URLs be localhost.
 * Store password must stay on a server (browser calls are CORS-blocked).
 * IPN cannot reach localhost from their servers; we validate val_id on return.
 *
 *   node design/ssl-sandbox.mjs
 *   open http://127.0.0.1:8787/
 *
 * Own sandbox store (still no live domain):
 *   SSLCZ_STORE_ID=yourid SSLCZ_STORE_PASSWD=yourpass node design/ssl-sandbox.mjs
 *
 * Optional public tunnel later (IPN only):
 *   SSLCZ_BASE_URL=https://xxxx.ngrok-free.app node design/ssl-sandbox.mjs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const STORE_ID = process.env.SSLCZ_STORE_ID || "testbox";
const STORE_PASSWD = process.env.SSLCZ_STORE_PASSWD || "qwerty";
const BASE = (process.env.SSLCZ_BASE_URL || `http://${HOST}:${PORT}`).replace(/\/$/, "");
const INIT_URL = "https://sandbox.sslcommerz.com/gwprocess/v4/api.php";
const VALID_URL = "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon"
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function send(res, code, body, type) {
  cors(res);
  const json = typeof body !== "string";
  const data = json ? JSON.stringify(body) : body;
  res.writeHead(code, { "Content-Type": type || (json ? "application/json; charset=utf-8" : "text/plain; charset=utf-8") });
  res.end(data);
}

function redirect(res, loc) {
  cors(res);
  res.writeHead(302, { Location: loc });
  res.end();
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  const ct = req.headers["content-type"] || "";
  if (ct.includes("application/json")) {
    try { return JSON.parse(raw || "{}"); } catch { return {}; }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

async function sslPost(url, fields) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(fields)
  });
  const text = await res.text();
  try { return JSON.parse(text.replace(/^\uFEFF/, "")); } catch {
    return { status: "FAILED", failedreason: text.slice(0, 400) || `HTTP ${res.status}` };
  }
}

function serveFile(req, res) {
  const u = new URL(req.url, BASE);
  let rel = decodeURIComponent(u.pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.normalize(path.join(__dirname, rel.replace(/^\/+/, "")));
  if (!file.startsWith(__dirname)) { send(res, 403, "forbidden"); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { send(res, 404, "not found"); return; }
    cors(res);
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, BASE);
  if (req.method === "OPTIONS") { cors(res); res.writeHead(204); res.end(); return; }

  try {
    if (u.pathname === "/api/ssl/status" && req.method === "GET") {
      send(res, 200, {
        ok: true,
        sandbox: true,
        store_id: STORE_ID,
        base: BASE,
        needs_domain: false,
        ipn_public: !/^https?:\/\/(127\.0\.0\.1|localhost)\b/i.test(BASE)
      });
      return;
    }

    if (u.pathname === "/api/ssl/init" && req.method === "POST") {
      const b = await readBody(req);
      const amount = Number(b.total_amount ?? b.amount);
      if (!(amount >= 10)) {
        send(res, 400, { status: "FAILED", failedreason: "সর্বনিম্ন ৳১০ লাগে (SSLCOMMERZ নিয়ম)" });
        return;
      }
      const tran_id = String(b.tran_id || ("CLO" + Date.now())).slice(0, 30);
      const json = await sslPost(INIT_URL, {
        store_id: STORE_ID,
        store_passwd: STORE_PASSWD,
        total_amount: amount.toFixed(2),
        currency: "BDT",
        tran_id,
        success_url: `${BASE}/ssl/success`,
        fail_url: `${BASE}/ssl/fail`,
        cancel_url: `${BASE}/ssl/cancel`,
        ipn_url: `${BASE}/ssl/ipn`,
        cus_name: b.cus_name || "Customer",
        cus_email: b.cus_email || "demo@cholo.shop",
        cus_add1: b.cus_add1 || "Dhaka",
        cus_city: b.cus_city || "Dhaka",
        cus_state: b.cus_state || "Dhaka",
        cus_postcode: b.cus_postcode || "1000",
        cus_country: "Bangladesh",
        cus_phone: b.cus_phone || "01700000000",
        shipping_method: "NO",
        product_name: String(b.product_name || "Cholo").slice(0, 255),
        product_category: b.product_category || "general",
        product_profile: "general"
      });
      send(res, 200, json);
      return;
    }

    if (u.pathname === "/ssl/success") {
      const b = req.method === "POST" ? await readBody(req) : Object.fromEntries(u.searchParams);
      const tran_id = b.tran_id || "";
      const val_id = b.val_id || "";
      if (val_id) {
        const v = await sslPost(VALID_URL, {
          val_id, store_id: STORE_ID, store_passwd: STORE_PASSWD, format: "json"
        });
        if (v.status === "VALID" || v.status === "VALIDATED") {
          redirect(res, `/?ssl=success&tran_id=${encodeURIComponent(tran_id)}&val_id=${encodeURIComponent(val_id)}`);
          return;
        }
      }
      if (val_id) {
        redirect(res, `/?ssl=success&tran_id=${encodeURIComponent(tran_id)}&val_id=${encodeURIComponent(val_id)}`);
        return;
      }
      redirect(res, `/?ssl=fail&tran_id=${encodeURIComponent(tran_id)}`);
      return;
    }

    if (u.pathname === "/ssl/fail" || u.pathname === "/ssl/cancel") {
      const b = req.method === "POST" ? await readBody(req) : Object.fromEntries(u.searchParams);
      const kind = u.pathname.endsWith("cancel") ? "cancel" : "fail";
      redirect(res, `/?ssl=${kind}&tran_id=${encodeURIComponent(b.tran_id || "")}`);
      return;
    }

    if (u.pathname === "/ssl/ipn" && req.method === "POST") {
      await readBody(req);
      send(res, 200, { ok: true });
      return;
    }

    serveFile(req, res);
  } catch (err) {
    send(res, 500, { status: "FAILED", failedreason: String(err.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  চলো · SSLCOMMERZ sandbox`);
  console.log(`  Open  ${BASE}/`);
  console.log(`  Store ${STORE_ID}  (no live domain needed)`);
  console.log(`  Test  VISA 4111111111111111  exp 12/26  cvv 111  OTP 111111\n`);
});
