// parse.js — tiny keyless JSON extractor for the infrastructure tracker.
// Usage: <json-on-stdin> | node parse.js <mode> [args...]
//   certspotter  : certspotter issuances → one DNS name per line
//   crtsh        : crt.sh JSON           → one DNS name per line (splits name_value, strips "*.")
//   urlscan      : urlscan search JSON   → "domain<TAB>ip<TAB>asn<TAB>matched_url<TAB>scan_uuid"
//                  per result (apex CONTEXT queries only — trusted, already-curated
//                  apex/redirector discovery)
//   urlscan-apex : urlscan search JSON   → one apexDomain per line, recency-filtered
//   urlscan-kit  : urlscan search JSON   → "apex<TAB>domain<TAB>ip<TAB>asn<TAB>matched_url<TAB>scan_uuid"
//                  per result, but ONLY for results that pass a precision filter (see below) —
//                  this is what drives auto-apex-promotion, so false accepts here poison the watchlist.
//                  argv[3] = maxAgeDays, argv[4] = "url" | "hash"
//                    "url"  : the query was a broad text/phrase match (e.g. "us=gm") that
//                             urlscan's tokenizer can match on unrelated URLs (word-adjacency,
//                             not exact substring) — require BOTH a strict client-side regex
//                             on page.url/task.url AND page.asn === AS13335 (Operator A is
//                             100% Cloudflare-fronted) before accepting.
//                    "hash" : the query was a content-hash match (hash:<sha256> of a kit JS
//                             chunk) — hash collision is not a real-world risk, so only the
//                             recency filter applies, no URL/ASN gate.
//   urlscan-ip   : urlscan page.ip:"<ip>" context JSON → "page.domain<TAB>matched_url<TAB>scan_uuid"
//                  per result, for a CURATED origin IP only (never auto-promoted origins — that
//                  mechanism is removed). argv[3] = ip, argv[4] = maxAgeDays, argv[5] = breaker
//                  threshold (default 15). Deliberately emits ONLY page.domain (never task.url's
//                  HOST — that redirector-hostname extraction is the amplification vector that
//                  turned one mis-classified shared IP into hundreds of false "new domain"
//                  indicators; the matched_url column here is evidence FOR this domain's own
//                  finding, not a second indicator). If the number of DISTINCT apexes on that IP
//                  exceeds the breaker threshold, the IP is not actually dedicated (a shared/
//                  anycast/CDN pool) — print a single "CIRCUIT_BREAK<TAB>count" line and nothing
//                  else, so check.sh can denylist it instead of trusting it.
//   urlscan-hashes: a urlscan RESULT API JSON (/api/v1/result/<uuid>/) → one sha256 per line,
//                  for every /_next/static/chunks/*.js response — used to auto-extend
//                  fingerprints.txt as the kit gets rebuilt (hash chaining).
//   doh          : DNS-over-HTTPS JSON   → one A/AAAA address per line
// Bad/empty/non-JSON input exits 0 silently (so the caller never breaks on a flaky API).
const mode = process.argv[2];
let s = "";
process.stdin.on("data", d => (s += d)).on("end", () => {
  let j;
  try { j = JSON.parse(s); } catch { process.exit(0); }
  const host = x => {
    x = String(x).trim().toLowerCase().replace(/^\*\./, "");
    if (x && !x.includes(" ")) console.log(x);
  };
  // Evidence fields ride along in plain TSV rows that check.sh eventually writes
  // into CSV with printf (no quoting) — a literal comma would silently shift
  // every column after it. URLs/UUIDs are the only free-form-ish values here,
  // so % -encode just the comma rather than reject or truncate real evidence.
  const safe = x => String(x || "").replace(/,/g, "%2C").replace(/\t/g, " ").replace(/[\r\n]/g, "");
  if (mode === "certspotter") {
    (Array.isArray(j) ? j : []).forEach(c => (c.dns_names || []).forEach(host));
  } else if (mode === "crtsh") {
    (Array.isArray(j) ? j : []).forEach(c =>
      String(c.name_value || "").split(/\n/).forEach(host));
  } else if (mode === "urlscan") {
    ((j && j.results) || []).forEach(r => {
      const p = r.page || {}, t = r.task || {};
      const dom = String(p.domain || "").trim().toLowerCase();
      const url = safe(p.url || t.url), uuid = safe(t.uuid);
      if (dom) console.log([dom, String(p.ip || "").trim(), String(p.asn || "").trim(), url, uuid].join("\t"));
      // F3: the SUBMITTED url's host is often an upstream redirector in the kit
      // chain (e.g. arsenalroel.org -> landing?us=gm) that page.domain misses.
      // Emit it as an indicator (no per-result IP/ASN; the DNS pass resolves it).
      // Kept ONLY for trusted apex/pattern CONTEXT queries (already-curated apex) —
      // NEVER used for page.ip queries (see urlscan-ip) or fingerprint queries (see
      // urlscan-kit), which is where this amplified unrelated noise in the past.
      let rhost = "";
      try { rhost = new URL(String(t.url || "")).hostname.trim().toLowerCase(); } catch {}
      if (rhost && rhost !== dom) console.log([rhost, "", "", url, uuid].join("\t"));
    });
  } else if (mode === "urlscan-apex") {
    // Kit-CONFIRMED apexes for auto-promotion: page.apexDomain of results that
    // matched a kit fingerprint. Recency-filtered (argv[3] = max age in days,
    // default 730) to drop stale incidental matches (e.g. a 2022 scan of an
    // unrelated site whose URL happened to contain the token). Unparseable time
    // is kept (never lose a real lead).
    const maxAge = ((parseInt(process.argv[3], 10) || 730)) * 86400000;
    const now = Date.now();
    ((j && j.results) || []).forEach(r => {
      const a = String((r.page || {}).apexDomain || "").trim().toLowerCase();
      const ts = Date.parse((r.task || {}).time || "");
      if (a && (!ts || (now - ts) <= maxAge)) console.log(a);
    });
  } else if (mode === "urlscan-kit") {
    const maxAge = ((parseInt(process.argv[3], 10) || 30)) * 86400000;
    const kind = process.argv[4] || "url";
    const now = Date.now();
    // urlscan's search analyzer tokenizes on punctuation, so a phrase query like
    // "us=gm" matches "/us/gm-..." too (word-adjacency, not exact substring). This
    // regex is the actual precision gate — it is enforced HERE, client-side, not
    // in the query string (verified live: no query-string form avoids the collision).
    const URLRE = /^https?:\/\/[^\/]+\/a\/[A-Za-z0-9_-]{12,24}(?:[?#]|$).*?(?:[?&]us=(?:gm|dlm|sml|ym|cg)(?:&|$))?/i;
    const USRE  = /[?&]us=(?:gm|dlm|sml|ym|cg)(?:&|$)/i;
    ((j && j.results) || []).forEach(r => {
      const p = r.page || {}, t = r.task || {};
      const ts = Date.parse(t.time || "");
      if (ts && (now - ts) > maxAge) return;             // stale — drop
      const url = String(p.url || t.url || "");
      if (kind === "url") {
        const isTokenPath = /^https?:\/\/[^\/]+\/a\/[A-Za-z0-9_-]{12,24}(?:[?&#]|$)/i.test(url);
        const hasUsTag    = USRE.test(url);
        if (!isTokenPath && !hasUsTag) return;            // neither shape matched — drop
        const asn = String(p.asn || "").trim().toUpperCase();
        if (asn !== "AS13335") return;                    // Operator A is 100% Cloudflare-fronted
      }
      // kind === "hash": content-hash already proves kit identity — recency is the only gate.
      const apex = String(p.apexDomain || "").trim().toLowerCase();
      const dom  = String(p.domain || "").trim().toLowerCase();
      if (!apex && !dom) return;
      console.log([apex || dom, dom, String(p.ip || "").trim(), String(p.asn || "").trim(), safe(url), safe(t.uuid)].join("\t"));
    });
  } else if (mode === "urlscan-ip") {
    const ip = String(process.argv[3] || "").trim();
    const maxAge = ((parseInt(process.argv[4], 10) || 30)) * 86400000;
    const breaker = parseInt(process.argv[5], 10) || 15;
    const now = Date.now();
    const results = (j && j.results) || [];
    // Two independent breaker signals, either one trips it:
    //  (a) the server-reported TOTAL match count (not just this page of results) — a
    //      heavily-scanned shared/anycast LB address (e.g. AWS Global Accelerator) racks
    //      up hundreds of hits from automated internet-wide scanners hitting the bare IP
    //      with no hostname at all, which distinct-apex counting alone misses because
    //      page.apexDomain/page.domain often equal the IP itself for those hits.
    //  (b) the distinct REAL hostnames seen (excluding domain === ip, i.e. bare-IP scans,
    //      which are not a tenant/indicator at all) — catches shared IPs with genuinely
    //      many different tenant domains.
    const total = Number((j && j.total) || 0);
    const totalBreaker = Math.max(breaker * 4, 50);
    const domains = new Set();
    results.forEach(r => {
      const dom = String((r.page || {}).domain || "").trim().toLowerCase();
      if (dom && dom !== ip) domains.add(dom);
    });
    if (total > totalBreaker || domains.size > breaker) {
      // Not actually dedicated — a real single/low-tenant origin has neither a large
      // total scan count nor many distinct real hostnames. Emit nothing but the breaker
      // signal; check.sh denylists the IP instead of trusting it.
      console.log(`CIRCUIT_BREAK\ttotal=${total}\tdomains=${domains.size}`);
      return;
    }
    results.forEach(r => {
      const p = r.page || {}, t = r.task || {};
      if (String(p.ip || "").trim() !== ip) return;       // exact IP match only
      const dom = String(p.domain || "").trim().toLowerCase();
      if (!dom || dom === ip) return;                     // skip bare-IP-as-domain scans
      const ts = Date.parse(t.time || "");
      if (ts && (now - ts) > maxAge) return;
      // page.domain is the only INDICATOR emitted (never task.url's host — see
      // header); the url/uuid here are just this domain's OWN evidence pointer.
      console.log([dom, safe(p.url || t.url), safe(t.uuid)].join("\t"));
    });
  } else if (mode === "urlscan-hashes") {
    // Result-API JSON (not search JSON): pull sha256 hashes of the kit's own JS chunks
    // for hash-chaining fingerprints.txt as the operators rebuild the kit.
    // urlscan puts the body hash at requests[].response.hash (a sibling of the
    // HTTP-level requests[].response.response object). Reading only the nested
    // path silently returned nothing from 2026-09-25 to 2026-10-02, so chaining
    // never ran while the kit was rebuilt; accept both locations.
    ((j && j.data && j.data.requests) || []).forEach(req => {
      const url = String((req.request && req.request.request && req.request.request.url) ||
                         (req.response && req.response.response && req.response.response.url) || "");
      const r = req.response || {};
      const hash = r.hash || (r.response && r.response.hash) || "";
      if (/^[a-f0-9]{64}$/i.test(hash) && /\/_next\/static\/chunks\/.*\.js(?:[?#]|$)/i.test(url)) console.log(hash.toLowerCase());
    });
  } else if (mode === "urlscan-known") {
    // Hash-chaining precision gate. Search JSON for hash:<sha256> → "<total>\t<known>",
    // where <known> = distinct apexes/domains in the results that are already known kit
    // infrastructure (argv[3] = file, one domain per line). Kit chunks co-occur with
    // known kit domains; generic Next.js/Cloudflare chunks don't.
    let known = new Set();
    try { known = new Set(require("fs").readFileSync(process.argv[3], "utf8").split(/\s+/).filter(Boolean).map(x => x.toLowerCase())); } catch {}
    const seen = new Set();
    ((j && j.results) || []).forEach(r => {
      const p = r.page || {};
      for (const d of [p.apexDomain, p.domain]) {
        const x = String(d || "").trim().toLowerCase();
        if (x && known.has(x)) seen.add(x);
      }
    });
    console.log([Number((j && j.total) || 0), seen.size].join("\t"));
  } else if (mode === "doh") {
    ((j && j.Answer) || []).forEach(a => {
      if (a && (a.type === 1 || a.type === 28)) console.log(String(a.data).trim());
    });
  }
});
