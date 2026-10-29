// Lists every t('...') string in the app that has no Hebrew translation in src/utils/strings.he.js.
// Run: npm run check:i18n   (exits with code 1 when something is missing)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const he = (await import('../src/utils/strings.he.js')).default;

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    // i18n.js and strings.he.js only mention t('...') in comments
    else if (/\.(jsx?|tsx?)$/.test(name) && !/^(i18n|strings\.he)\.js$/.test(name)) files.push(p);
  }
})(src);

const used = new Set();
const pattern = /\bt\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
for (const file of files) {
  for (const m of readFileSync(file, 'utf8').matchAll(pattern)) used.add(m[1].slice(1, -1).replace(/\\'/g, "'"));
}

const missing = [...used].filter((key) => he[key] === undefined);
console.log(`${used.size} translated strings in use, ${Object.keys(he).length} Hebrew entries.`);

// Reminder copy lives in pure-data pools (rendered through t() at runtime, not literal t('...') calls).
const { POOLS, LUCKY, REACTIONS, ARCS } = await import('../src/utils/reminderPools.js');
const groups = {
  POOLS: Object.values(POOLS).flat(),
  LUCKY,
  REACTIONS: Object.values(REACTIONS).flat(),
  ARCS: ARCS.flatMap((a) => a.episodes),
};
const pool = new Set(["{name}'s Week · {n}/7"]);
for (const [name, entries] of Object.entries(groups)) {
  const set = new Set();
  for (const e of entries) {
    set.add(e.title);
    set.add(e.body);
  }
  set.forEach((s) => pool.add(s));
  console.log(`  ${name}: ${entries.length} entries, ${set.size} distinct strings`);
}
console.log(`${pool.size} reminder strings checked (incl. the saga title).`);
const poolMissing = [...pool].filter((key) => he[key] === undefined);
missing.push(...poolMissing);
if (missing.length) {
  console.log(`Missing Hebrew for ${missing.length}:`);
  missing.forEach((k) => console.log('  - ' + k));
  process.exit(1);
}
console.log('All strings have Hebrew. ✓');
