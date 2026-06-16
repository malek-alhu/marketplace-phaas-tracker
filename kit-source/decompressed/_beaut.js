const fs = require('fs');
const path = require('path');
const f = process.argv[2];
const s = fs.readFileSync(f, 'utf8');
let out = '';
let depth = 0;
let inStr = false;
let q = '';
let esc = false;
for (let i = 0; i < s.length; i++) {
  const c = s[i];
  if (inStr) {
    out += c;
    if (esc) { esc = false; }
    else if (c === '\\') { esc = true; }
    else if (c === q) { inStr = false; }
    continue;
  }
  if (c === '"' || c === "'" || c === '`') {
    inStr = true; q = c; out += c; continue;
  }
  if (c === '{') { depth++; out += c + '\n' + '  '.repeat(depth); }
  else if (c === '}') { depth = Math.max(0, depth - 1); out += '\n' + '  '.repeat(depth) + c; }
  else if (c === ';') { out += c + '\n' + '  '.repeat(depth); }
  else if (c === ',') { out += c + '\n' + '  '.repeat(depth); }
  else { out += c; }
}
const base = path.basename(f).slice(0, 8);
const outDir = process.argv[3] || '.';
fs.writeFileSync(path.join(outDir, base + '.beaut.js'), out);
console.log('done ' + base + ' lines=' + out.split('\n').length);
