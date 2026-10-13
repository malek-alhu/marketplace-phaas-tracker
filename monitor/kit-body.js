#!/usr/bin/env node
// =============================================================================
// monitor/kit-body.js — binary-safe archiving + verification of kit JS bodies.
//
// urlscan's /responses/<sha256>/ returns the body as the server sent it (here:
// gzip). <sha256> is the hash of the DECODED body, so every archived sample is
// self-verifying. Bug fixed 2026-10-13: check.sh captured bodies with
// body="$(us_response ...)", and bash command substitution silently drops every
// 0x00 byte — 67 of 139 archived raw bodies were corrupted (gzip header
// 1f8b0800 00000000 0003 → 1f8b0803) and never decodable. Bodies now go
// straight from curl to a file and are only archived if they verify.
//
//   node kit-body.js archive <sha256> <downloaded-file> <raw_dir> <decompressed_dir>
//       decode (gzip / brotli / deflate / plain) → verify sha256(decoded) == <sha256>
//       → write <raw_dir>/<sha256>.js + <decompressed_dir>/<sha256>.js.txt and
//       update both SHA256SUMS.txt. Exit 0 = archived, 1 = did not verify.
//   node kit-body.js audit <raw_dir> <decompressed_dir>
//       print the hash of every raw body that does not decode+verify (one per line).
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const HASH = /^[0-9a-f]{64}$/;

function decode(buf) {
  const tries = [zlib.gunzipSync, zlib.brotliDecompressSync, zlib.inflateSync, zlib.inflateRawSync, (b) => b];
  for (const f of tries) {
    try { return f(buf); } catch { /* next */ }
  }
  return null;
}

function verified(buf, hash) {
  const out = decode(buf);
  if (out && sha(out) === hash) return out;
  // Bodies that urlscan stored uncompressed hash directly.
  if (sha(buf) === hash) return buf;
  return null;
}

function setSum(sumsFile, name, sum) {
  const lines = fs.existsSync(sumsFile) ? fs.readFileSync(sumsFile, 'utf8').split('\n').filter(Boolean) : [];
  const kept = lines.filter((l) => !l.endsWith('  ' + name));
  kept.push(`${sum}  ${name}`);
  fs.writeFileSync(sumsFile, kept.join('\n') + '\n');
}

const [mode, ...a] = process.argv.slice(2);
if (mode === 'archive') {
  const [hash, file, rawDir, decDir] = a;
  if (!HASH.test(hash || '')) { console.error('bad hash'); process.exit(2); }
  const buf = fs.readFileSync(file);
  const out = verified(buf, hash);
  if (!out) { console.error(`${hash}: body does not verify (${buf.length} bytes)`); process.exit(1); }
  const rawName = `${hash}.js`, decName = `${hash}.js.txt`;
  fs.writeFileSync(path.join(rawDir, rawName), buf);
  fs.writeFileSync(path.join(decDir, decName), out);
  setSum(path.join(rawDir, 'SHA256SUMS.txt'), rawName, sha(buf));
  setSum(path.join(decDir, 'SHA256SUMS.txt'), decName, sha(out));
  process.exit(0);
} else if (mode === 'audit') {
  const [rawDir] = a;
  for (const f of fs.readdirSync(rawDir).sort()) {
    const m = f.match(/^([0-9a-f]{64})\.js$/);
    if (m && !verified(fs.readFileSync(path.join(rawDir, f)), m[1])) console.log(m[1]);
  }
} else {
  console.error('usage: kit-body.js archive <sha256> <file> <raw_dir> <decompressed_dir> | audit <raw_dir>');
  process.exit(2);
}
