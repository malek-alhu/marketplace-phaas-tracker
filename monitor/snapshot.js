#!/usr/bin/env node
// snapshot.js — writes monitor/state/status.json, a single machine-readable
// orientation file for whoever (human or agent) next picks up this tracker.
//
// Why this exists: the tracker's own history shows that reconstructing "what
// is actually going on right now" from findings.csv + monitor.log + several
// state files takes a lot of live re-querying (see docs/operation-dossier.md's
// 2026-09-25 incident note). This file is that reconstruction, done once per
// run, so a future analyst reads ONE small JSON file first instead of
// re-deriving ground truth from scratch.
//
// Usage: node monitor/snapshot.js <monitor-dir> > monitor/state/status.json
// Reads only; never queries anything external. Best-effort — a missing/
// malformed input file is skipped, never a fatal error (this must never break
// the run it's summarizing).
const fs = require("fs");
const path = require("path");

const MON = process.argv[2];
if (!MON) { console.error("usage: snapshot.js <monitor-dir>"); process.exit(1); }
const p = (...xs) => path.join(MON, ...xs);

function readLines(file) {
  try { return fs.readFileSync(file, "utf8").split("\n").filter(l => l.length); }
  catch { return []; }
}
function readCsv(file) {   // naive split — fine for this repo's comma-free field values
  return readLines(file).map(l => l.split(","));
}
function readTsv(file) {
  return readLines(file).map(l => l.split("\t"));
}

const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");

// --- tracked hosts: counts by status and operator -----------------------
const tracked = readTsv(p("state", "tracked_hosts.tsv"));
const trackedByStatus = {};
const trackedByOperator = {};
for (const row of tracked) {
  const [, tier, oper, , , , , status] = row;
  if (!status) continue;
  trackedByStatus[status] = (trackedByStatus[status] || 0) + 1;
  const key = `${oper || "?"}:tier${tier || "?"}`;
  trackedByOperator[key] = (trackedByOperator[key] || 0) + 1;
}

// --- fingerprints: current hash roster + freshness -----------------------
const fpLines = readLines(p("fingerprints.txt")).filter(l => !l.startsWith("#"));
const fingerprints = fpLines.map(l => {
  const [hash, label, added, last_confirmed_hit, status] = l.split("\t");
  return { hash, label, added, last_confirmed_hit, status };
}).filter(f => f.hash);

// --- recent tier-1 findings (last 20) ------------------------------------
const findRows = readCsv(p("findings.csv"));
const header = findRows.shift() || [];
const idx = k => header.indexOf(k);
const tierI = idx("tier"), opI = idx("operator"), tI = idx("type"), iI = idx("indicator"), fsI = idx("first_seen");
const tier1 = findRows.filter(r => r[tierI] === "1");
const recentTier1 = tier1.slice(-20).map(r => ({
  type: r[tI], indicator: r[iI], operator: r[opI], first_seen: r[fsI],
}));
const tier1CountByOperator = {};
for (const r of tier1) {
  const o = r[opI] || "?";
  tier1CountByOperator[o] = (tier1CountByOperator[o] || 0) + 1;
}

// --- pending Operator-B weekly digest -------------------------------------
const pendingOpb = readLines(p("state", "pending_opb.txt"));

// --- last HEALTH line from monitor.log ------------------------------------
const logLines = readLines(p("monitor.log"));
let lastHealth = null, lastRunTs = null, lastRunSummary = null;
for (let i = logLines.length - 1; i >= 0 && (!lastHealth || !lastRunSummary); i--) {
  const l = logLines[i];
  if (!lastHealth && l.includes("] HEALTH ")) lastHealth = l;
  if (!lastRunSummary && (l.includes("new tier-1") || l.includes("no new tier-1"))) lastRunSummary = l;
}
if (logLines.length) {
  const m = logLines[logLines.length - 1].match(/^\[([^\]]+)\]/);
  if (m) lastRunTs = m[1];
}

// --- discovered.csv: pending manual-review candidates ---------------------
const discoRows = readCsv(p("discovered.csv"));
discoRows.shift();
const candidateCount = discoRows.filter(r => r[2] === "candidate").length;

const snapshot = {
  generated_at: now,
  last_run_at: lastRunTs,
  last_run_summary: lastRunSummary,
  last_health_line: lastHealth,
  tracked_hosts: { total: tracked.length, by_status: trackedByStatus, by_operator_tier: trackedByOperator },
  fingerprints,
  tier1_findings_total_by_operator: tier1CountByOperator,
  recent_tier1_findings: recentTier1,
  pending_operator_b_digest_count: pendingOpb.length,
  manual_review_candidates_pending: candidateCount,
  note: "See docs/operation-dossier.md for full narrative context (kill chain, IOCs, incident history). This file is a point-in-time orientation snapshot only, regenerated every run — do not hand-edit.",
};

process.stdout.write(JSON.stringify(snapshot, null, 2) + "\n");
