// parse.js — tiny keyless JSON extractor for the infrastructure tracker.
// Usage: <json-on-stdin> | node parse.js <mode>
//   certspotter : certspotter issuances → one DNS name per line
//   crtsh       : crt.sh JSON           → one DNS name per line (splits name_value, strips "*.")
//   urlscan     : urlscan search JSON   → "domain<TAB>ip<TAB>asn" per result
//   doh         : DNS-over-HTTPS JSON   → one A/AAAA address per line
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
  if (mode === "certspotter") {
    (Array.isArray(j) ? j : []).forEach(c => (c.dns_names || []).forEach(host));
  } else if (mode === "crtsh") {
    (Array.isArray(j) ? j : []).forEach(c =>
      String(c.name_value || "").split(/\n/).forEach(host));
  } else if (mode === "urlscan") {
    ((j && j.results) || []).forEach(r => {
      const p = r.page || {}, t = r.task || {};
      const dom = String(p.domain || "").trim().toLowerCase();
      if (dom) console.log([dom, String(p.ip || "").trim(), String(p.asn || "").trim()].join("\t"));
      // F3: the SUBMITTED url's host is often an upstream redirector in the kit
      // chain (e.g. arsenalroel.org -> landing?us=gm) that page.domain misses.
      // Emit it as an indicator (no per-result IP/ASN; the DNS pass resolves it).
      let rhost = "";
      try { rhost = new URL(String(t.url || "")).hostname.trim().toLowerCase(); } catch {}
      if (rhost && rhost !== dom) console.log([rhost, "", ""].join("\t"));
    });
  } else if (mode === "doh") {
    ((j && j.Answer) || []).forEach(a => {
      if (a && (a.type === 1 || a.type === 28)) console.log(String(a.data).trim());
    });
  }
});
