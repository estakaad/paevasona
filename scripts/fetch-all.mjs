import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Load .env manually
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
const FORCE = process.argv.includes('--force');

if (!API_KEY) {
  console.error('EKILEX_API_KEY puudub');
  process.exit(1);
}

const dataFile = join(ROOT, 'data', 'data.json');
if (!existsSync(dataFile)) {
  console.error('data/data.json ei leitud');
  process.exit(1);
}

const cacheDir = join(ROOT, 'cache');
if (!existsSync(cacheDir)) mkdirSync(cacheDir);

const data = JSON.parse(readFileSync(dataFile, 'utf8'));
const indexFile = join(cacheDir, 'index.json');
const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : [];

async function fetchWord(date, word) {
  const cacheFile = join(cacheDir, `${date}.json`);

  if (existsSync(cacheFile) && !FORCE) {
    console.log(`${date} (${word}): juba olemas, jätan vahele. Kasuta --force uuendamiseks.`);
    return;
  }

  console.log(`${date} (${word}): fetching...`);

  try {
    // Step 1: get wordIds
    const idsRes = await fetch(
      `${API_URL}/api/word/ids/${encodeURIComponent(word)}/${DATASET}/est`,
      { headers: { 'ekilex-api-key': API_KEY } }
    );
    if (!idsRes.ok) throw new Error(`word/ids: ${idsRes.status}`);
    const wordIds = await idsRes.json();
    if (!wordIds.length) throw new Error(`Sõna "${word}" ei leitud`);

    const wordId = wordIds[0];

    // Step 2: get word details
    const detailsRes = await fetch(
      `${API_URL}/api/word/details/${wordId}/${DATASET}`,
      { headers: { 'ekilex-api-key': API_KEY } }
    );
    if (!detailsRes.ok) throw new Error(`word/details: ${detailsRes.status}`);
    const details = await detailsRes.json();

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
          sources: (u.sourceLinks || []).map(s => [s.sourceName, s.name].filter(Boolean).join(', ')).filter(Boolean),
        }))
        .slice(0, 3),
    }));

    const result = { date, word, wordId, lexemes };
    writeFileSync(cacheFile, JSON.stringify(result, null, 2), 'utf8');

    // Update index
    const existing = index.find(e => e.date === date);
    if (existing) {
      existing.word = word;
    } else {
      index.push({ date, word });
    }

    console.log(`${date} (${word}): OK`);
  } catch (err) {
    console.error(`${date} (${word}): VIGA — ${err.message}`);
  }
}

for (const entry of data) {
  await fetchWord(entry.date, entry.word);
}

index.sort((a, b) => b.date.localeCompare(a.date));
writeFileSync(indexFile, JSON.stringify(index, null, 2), 'utf8');
console.log('\nValmis. cache/index.json uuendatud.');
