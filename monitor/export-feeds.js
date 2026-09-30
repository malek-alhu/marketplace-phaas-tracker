#!/usr/bin/env node
// export-feeds.js — publishes the reviewed indicator set as drop-in community feeds.
//
// Usage: node monitor/export-feeds.js <repo-root>   (writes <repo-root>/feeds/*)
//
// Sources, in order of trust:
//   1. docs/indicators.csv — human-reviewed IOCs (domains, Operator-B origin IPs).
//   2. monitor/findings.csv — only tier-1 domains confirmed by a kit fingerprint
//      (source "urlscan-kit(...)"), so a fresh rotation reaches the feed before
//      anyone curates it.
// Never exported: denylist.txt entries, and hacked LEGIT sites (watchlist "dnsonly"
// apexes and all their subdomains) — putting a victim's mail/cpanel host on a
// blocklist would hurt the victim, not the operator.
//
// Output is deterministic (sorted, dates taken from the data, UUIDv5 ids) so the
// files only change when the underlying data does.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = process.argv[2];
if (!ROOT) { console.error("usage: export-feeds.js <repo-root>"); process.exit(1); }
const p = (...xs) => path.join(ROOT, ...xs);
const OUT = p("feeds");

function lines(file) {
  try { return fs.readFileSync(file, "utf8").split("\n"); } catch { return []; }
}

function parseCsv(file) {
  const rows = [];
  for (const line of lines(file)) {
    if (!line.trim()) continue;
    const row = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else cur += c;
    }
    row.push(cur);
    rows.push(row);
  }
  const [head, ...body] = rows;
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
}

const listEntries = file => lines(file).map(l => l.replace(/#.*/, "").trim()).filter(Boolean);

const deny = listEntries(p("monitor/denylist.txt")).map(e => e.toLowerCase());
const isDenied = v => deny.some(d => (d.endsWith(".") ? v.startsWith(d) : v === d));
const legitVictims = listEntries(p("monitor/watchlist.txt"))
  .map(l => l.split(/\s+/)).filter(f => f[1] === "dnsonly").map(f => f[0].toLowerCase());
const isVictimSite = d => legitVictims.some(a => d === a || d.endsWith("." + a));

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const day = s => (/^\d{4}-\d{2}-\d{2}/.test(s || "") ? s.slice(0, 10) : null);

const domains = new Map();   // domain -> {operator, brand, first_seen, source}
const ips = new Map();       // ip -> {operator, first_seen, note}

function addDomain(d, meta) {
  d = d.toLowerCase().replace(/\.$/, "");
  if (!DOMAIN_RE.test(d) || isDenied(d) || isVictimSite(d)) return;
  const prev = domains.get(d);
  if (!prev || (meta.first_seen && (!prev.first_seen || meta.first_seen < prev.first_seen))) {
    domains.set(d, { ...prev, ...meta });
  }
}

for (const r of parseCsv(p("docs/indicators.csv"))) {
  const op = r.operator;
  if (r.type === "domain" && ["A", "B", "redirector"].includes(op)) {
    addDomain(r.indicator, { operator: op === "redirector" ? "A" : op, role: op === "redirector" ? "redirector" : "kit",
      brand: r.brand, first_seen: day(r.first_seen), source: "curated" });
  } else if (r.type === "ip" && op === "B" && IPV4_RE.test(r.indicator) && !isDenied(r.indicator)) {
    ips.set(r.indicator, { operator: "B", first_seen: day(r.first_seen), note: r.notes || "" });
  }
}

for (const r of parseCsv(p("monitor/findings.csv"))) {
  if (r.type === "domain" && r.tier === "1" && r.operator === "A" && /urlscan-kit/.test(r.source)) {
    addDomain(r.indicator, { operator: "A", role: "kit", brand: "", first_seen: day(r.first_seen), source: "tracker" });
  }
}

// Live = currently being resolved by the tracker (tracked_hosts.tsv "active").
const active = new Set(lines(p("monitor/state/tracked_hosts.tsv"))
  .map(l => l.split("\t")).filter(f => f[7] === "active").map(f => f[0].toLowerCase()));

const sorted = [...domains.keys()].sort();
const live = sorted.filter(d => active.has(d));
const lastDate = [...domains.values(), ...ips.values()].map(m => m.first_seen).filter(Boolean).sort().pop() || "1970-01-01";

const header = (title, n) => [
  `# ${title}`,
  `# Source: https://github.com/malek-alhu/marketplace-phaas-tracker (docs/indicators.csv + confirmed tracker hits)`,
  `# Entries: ${n} · newest first_seen: ${lastDate} · TLP:CLEAR`,
  `# Most kit domains rotate within days; historical entries are kept for retro-hunting.`,
  `# Hacked legitimate sites used as redirectors are intentionally excluded.`,
  ``,
].join("\n");

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "domains.txt"), header("Marketplace PhaaS — all known kit/redirector domains", sorted.length) + sorted.join("\n") + "\n");
fs.writeFileSync(path.join(OUT, "domains-live.txt"), header("Marketplace PhaaS — domains still resolving at the last tracker run", live.length) + live.join("\n") + (live.length ? "\n" : ""));
fs.writeFileSync(path.join(OUT, "adblock.txt"),
  ["! Title: Marketplace PhaaS (Classiscam/Telekopye-class) kit domains",
   "! Homepage: https://github.com/malek-alhu/marketplace-phaas-tracker",
   "! Expires: 1 day", `! Entries: ${sorted.length}`, ""].join("\n") + sorted.map(d => `||${d}^`).join("\n") + "\n");
fs.writeFileSync(path.join(OUT, "origin-ips.txt"), header("Marketplace PhaaS — Operator-B real origin IPs (bulletproof hosting)", ips.size) + [...ips.keys()].sort().join("\n") + "\n");

// STIX 2.1 bundle (deterministic ids: UUIDv5 over a fixed namespace).
const NS = Buffer.from("6f1c1b9e3d2a4c5b8e7f0a1b2c3d4e5f", "hex");
function uuid5(name) {
  const h = crypto.createHash("sha1").update(Buffer.concat([NS, Buffer.from(name)])).digest();
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
const ts = d => `${d || lastDate}T00:00:00.000Z`;
const identity = { type: "identity", spec_version: "2.1", id: `identity--${uuid5("identity")}`,
  created: ts("2026-06-15"), modified: ts("2026-06-15"), name: "marketplace-phaas-tracker", identity_class: "group" };
const campaigns = {
  A: { type: "campaign", spec_version: "2.1", id: `campaign--${uuid5("campaign-A")}`, created: ts("2026-06-15"), modified: ts("2026-06-15"),
       created_by_ref: identity.id, name: "Marketplace PhaaS — Operator A",
       description: "Cloudflare-fronted Next.js 16 multi-brand 'receive your payment' kit (OLX, Subito, Kleinanzeigen, Blocket, InPost, ...) with live operator chat and real-time card/OTP theft over self-hosted WebSockets." },
  B: { type: "campaign", spec_version: "2.1", id: `campaign--${uuid5("campaign-B")}`, created: ts("2026-06-15"), modified: ts("2026-06-15"),
       created_by_ref: identity.id, name: "Marketplace PhaaS — Operator B",
       description: "PHP 'Login area riservata' Subito phishing kit on exposed bulletproof origins (mainly AS210558)." },
};
const objects = [identity, campaigns.A, campaigns.B];
function indicator(key, pattern, name, op, first, labels) {
  const id = `indicator--${uuid5(key)}`;
  objects.push({ type: "indicator", spec_version: "2.1", id, created: ts(first), modified: ts(first), created_by_ref: identity.id,
    name, pattern, pattern_type: "stix", valid_from: ts(first), indicator_types: ["malicious-activity"], labels });
  objects.push({ type: "relationship", spec_version: "2.1", id: `relationship--${uuid5("rel-" + key)}`, created: ts(first), modified: ts(first),
    created_by_ref: identity.id, relationship_type: "indicates", source_ref: id, target_ref: campaigns[op].id });
}
for (const d of sorted) {
  const m = domains.get(d);
  indicator(`domain:${d}`, `[domain-name:value = '${d}']`, d, m.operator, m.first_seen,
    ["phishing", m.role, ...(m.brand ? [m.brand] : []), ...(active.has(d) ? ["resolving"] : [])]);
}
for (const ip of [...ips.keys()].sort()) {
  indicator(`ip:${ip}`, `[ipv4-addr:value = '${ip}']`, ip, "B", ips.get(ip).first_seen, ["phishing", "origin"]);
}
indicator("url-pattern:entry", "[url:value MATCHES '/a/[A-Za-z0-9_-]{12,24}\\\\?us=(gm|dlm|sml|ym|cg)']",
  "Operator-A per-victim entry URL", "A", "2026-06-15", ["phishing", "url-pattern"]);
indicator("url-pattern:viewer", "[url:value MATCHES '/viewer/[A-Za-z0-9_-]{3,24}/(Ml8w|MV8w)/[A-Za-z0-9_-]{6,}']",
  "Operator-A fake-bank /viewer/ stage", "A", "2026-06-20", ["phishing", "url-pattern"]);
fs.writeFileSync(path.join(OUT, "stix2-bundle.json"),
  JSON.stringify({ type: "bundle", id: `bundle--${uuid5("bundle")}`, objects }, null, 1) + "\n");

console.log(`feeds: ${sorted.length} domains (${live.length} resolving), ${ips.size} origin IPs, ${objects.length} STIX objects`);
