import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Load .env
const envPath = join(ROOT, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

const API_KEY = process.env.EKILEX_API_KEY;
const API_URL = process.env.EKILEX_API_URL || 'https://ekilex.ee';
const SHEET_CSV_URL = process.env.GOOGLE_SHEET_CSV_URL;
const DATASET = 'eki';

if (!API_KEY) { console.error('EKILEX_API_KEY puudub'); process.exit(1); }
if (!SHEET_CSV_URL) { console.error('GOOGLE_SHEET_CSV_URL puudub'); process.exit(1); }

function parseCSVRow(line) {
  const cols = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { cols.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  cols.push(cur.trim());
  return cols;
}

// Fetch sheet CSV and parse date + word columns
console.log('Laen Google Sheetist...');
const csvRes = await fetch(SHEET_CSV_URL);
if (!csvRes.ok) throw new Error(`CSV päring ebaõnnestus: ${csvRes.status}`);
const csv = await csvRes.text();

function normalizeDate(raw) {
  raw = raw.trim();
  // YYYY-MM-DD — already correct
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // DD/MM/YYYY, DD.MM.YYYY or D/M/YYYY
  const m = raw.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

const schedule = csv.trim().split('\n')
  .slice(1) // skip header row
  .map(line => {
    const cols = parseCSVRow(line);
    return { date: normalizeDate(cols[0] || ''), word: (cols[1] || '').trim() };
  })
  .filter(({ date, word }) => date && word);

if (!schedule.length) {
  console.error('Sheetis ei leitud ühtegi kehtivat kirjet (veerg A: kuupäev YYYY-MM-DD, veerg B: sõna)');
  process.exit(1);
}

console.log(`${schedule.length} kirjet leitud (${schedule[0].date} kuni ${schedule[schedule.length - 1].date}).`);

// Fetch and cache a single word from Ekilex
async function fetchAndCache(date, word) {
  const cacheDir = join(ROOT, 'cache');
  if (!existsSync(cacheDir)) mkdirSync(cacheDir);
  const cacheFile = join(cacheDir, `${date}.json`);
  if (existsSync(cacheFile)) return false;

  const idsRes = await fetch(
    `${API_URL}/api/word/ids/${encodeURIComponent(word)}/${DATASET}/est`,
    { headers: { 'ekilex-api-key': API_KEY } }
  );
  if (!idsRes.ok) throw new Error(`word/ids: ${idsRes.status}`);
  const wordIds = await idsRes.json();
  if (!wordIds.length) throw new Error(`"${word}" ei leitud Ekilexist`);

  const wordId = wordIds[0];
  const detailsRes = await fetch(
    `${API_URL}/api/word/details/${wordId}/${DATASET}`,
    { headers: { 'ekilex-api-key': API_KEY } }
  );
  if (!detailsRes.ok) throw new Error(`word/details: ${detailsRes.status}`);
  const details = await detailsRes.json();

  // Fetch paradigm forms (nom/gen/par for nouns; ma/da/sg3 for verbs)
  const FORM_CODES = new Set(['SgN', 'SgG', 'SgP', 'Sup', 'Inf', 'IndPrSg3']);
  const forms = {};
  try {
    const paradigmRes = await fetch(
      `${API_URL}/api/paradigm/details/${wordId}`,
      { headers: { 'ekilex-api-key': API_KEY } }
    );
    if (paradigmRes.ok) {
      for (const paradigm of await paradigmRes.json()) {
        if (paradigm.secondary) continue;
        for (const f of (paradigm.paradigmForms || [])) {
          if (FORM_CODES.has(f.morphCode) && f.morphExists && f.value && !forms[f.morphCode]) {
            forms[f.morphCode] = f.value;
          }
        }
      }
    }
  } catch {}

  const sourceIds = new Set();
  for (const lex of (details.lexemes || [])) {
    for (const u of (lex.usages || [])) {
      for (const s of (u.sourceLinks || [])) {
        if (s.sourceId) sourceIds.add(s.sourceId);
      }
    }
  }

  const sourceDetails = {};
  for (const sourceId of sourceIds) {
    try {
      const srcRes = await fetch(`${API_URL}/api/source/details/${sourceId}`, { headers: { 'ekilex-api-key': API_KEY } });
      if (srcRes.ok) {
        const src = await srcRes.json();
        sourceDetails[sourceId] = src.value || src.name || null;
      }
    } catch {}
  }

  const lexemes = (details.lexemes || []).map(lex => ({
    dataset: lex.datasetCode,
    pos: (lex.pos || []).map(p => p.value).filter(Boolean),
    definitions: ((lex.meaning && lex.meaning.definitions) || [])
      .filter(d => d.lang === 'est')
      .map(d => d.valuePrese || d.value),
    usages: (lex.usages || [])
      .filter(u => u.lang === 'est')
      .map(u => ({
        text: u.valuePrese || u.value,
        sources: (u.sourceLinks || []).map(s => ({
          label: [s.sourceName, s.name].filter(Boolean).join(', '),
          detail: s.sourceId ? (sourceDetails[s.sourceId] || null) : null,
        })).filter(s => s.label),
      }))
      .slice(0, 3),
  }));

  writeFileSync(cacheFile, JSON.stringify({ date, word, wordId, forms, lexemes }, null, 2), 'utf8');
  return true;
}

// Fetch all words whose date is today or earlier
const today = new Date().toISOString().slice(0, 10);
const toFetch = schedule.filter(e => e.date <= today);
console.log(`Kontrollin ${toFetch.length} kirjet (kuni ${today})...`);

let fetched = 0;
for (const { date, word } of toFetch) {
  try {
    const isNew = await fetchAndCache(date, word);
    if (isNew) {
      console.log(`  OK: ${date} — ${word}`);
      fetched++;
    }
  } catch (err) {
    console.error(`  VIGA: ${date} (${word}) — ${err.message}`);
  }
}

// Rebuild index.json
const cacheDir = join(ROOT, 'cache');
const files = readdirSync(cacheDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
const index = files.map(f => {
  const date = f.replace('.json', '');
  const data = JSON.parse(readFileSync(join(cacheDir, f), 'utf8'));
  return { date, word: data.word };
}).sort((a, b) => b.date.localeCompare(a.date));

writeFileSync(join(cacheDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
console.log(`\nValmis. ${fetched} uut kirjet laaditud, index: ${index.length} sõna.`);
