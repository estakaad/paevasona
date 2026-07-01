import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Load .env manually (no external deps)
const envPath = join(ROOT, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

const API_KEY = process.env.EKILEX_API_KEY;
const API_URL = process.env.EKILEX_API_URL || 'https://ekilex.ee';
const DATASET = 'eki';

if (!API_KEY) {
  console.error('EKILEX_API_KEY puudub');
  process.exit(1);
}

const today = process.env.FETCH_DATE || new Date().toISOString().slice(0, 10);
const cacheDir = join(ROOT, 'cache');
const cacheFile = join(cacheDir, `${today}.json`);

if (existsSync(cacheFile)) {
  console.log(`${today} on juba cache'itud, vahetan välja.`);
}

// Read data.json
const dataFile = join(ROOT, 'data', 'data.json');
if (!existsSync(dataFile)) {
  console.error('data/data.json ei leitud');
  process.exit(1);
}

const data = JSON.parse(readFileSync(dataFile, 'utf8'));
const entry = data.find(e => e.date === today);

if (!entry) {
  console.log(`Kuupäevale ${today} sõna ei leitud data.json-is`);
  process.exit(0);
}

const word = entry.word;
console.log(`Fetching: ${word} (${today})`);

// Step 1: get wordIds
const idsUrl = `${API_URL}/api/word/ids/${encodeURIComponent(word)}/${DATASET}/est`;
const idsRes = await fetch(idsUrl, { headers: { 'ekilex-api-key': API_KEY } });

if (!idsRes.ok) {
  console.error(`word/ids päring ebaõnnestus: ${idsRes.status}`);
  process.exit(1);
}

const wordIds = await idsRes.json();
if (!wordIds.length) {
  console.error(`Sõna "${word}" ei leitud Ekilexist`);
  process.exit(1);
}

const wordId = wordIds[0];
console.log(`wordId: ${wordId}`);

// Step 2: get word details
const detailsUrl = `${API_URL}/api/word/details/${wordId}/${DATASET}`;
const detailsRes = await fetch(detailsUrl, { headers: { 'ekilex-api-key': API_KEY } });

if (!detailsRes.ok) {
  console.error(`word/details päring ebaõnnestus: ${detailsRes.status}`);
  process.exit(1);
}

const details = await detailsRes.json();

// Collect unique sourceIds from all usages
const sourceIds = new Set();
for (const lex of (details.lexemes || [])) {
  for (const u of (lex.usages || [])) {
    for (const s of (u.sourceLinks || [])) {
      if (s.sourceId) sourceIds.add(s.sourceId);
    }
  }
}

// Step 3: fetch source details for each unique sourceId
const sourceDetails = {};
for (const sourceId of sourceIds) {
  try {
    const srcRes = await fetch(`${API_URL}/api/source/details/${sourceId}`, { headers: { 'ekilex-api-key': API_KEY } });
    if (srcRes.ok) {
      const src = await srcRes.json();
      sourceDetails[sourceId] = src.value || src.name || null;
    }
  } catch {
    // ignore individual source fetch failures
  }
}

// Extract definitions from lexemes
const lexemes = (details.lexemes || []).map(lex => ({
  dataset: lex.datasetCode,
  pos: (lex.pos || []).map(p => p.value).filter(Boolean),
  definitions: ((lex.meaning && lex.meaning.definitions) || [])
    .filter(d => d.lang === 'est')
    .map(d => d.valuePrese || d.value),
  usages: ((lex.usages) || [])
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

const result = {
  date: today,
  word,
  wordId,
  lexemes,
};

if (!existsSync(cacheDir)) mkdirSync(cacheDir);
writeFileSync(cacheFile, JSON.stringify(result, null, 2), 'utf8');
console.log(`Salvestatud: cache/${today}.json`);

// Update cache/index.json
const indexFile = join(cacheDir, 'index.json');
const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : [];
const existing = index.find(e => e.date === today);
if (existing) {
  existing.word = word;
} else {
  index.push({ date: today, word });
}
index.sort((a, b) => b.date.localeCompare(a.date));
writeFileSync(indexFile, JSON.stringify(index, null, 2), 'utf8');
console.log('Uuendatud: cache/index.json');
