import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(__dirname, '..', 'cache');
const indexFile = join(cacheDir, 'index.json');

const files = readdirSync(cacheDir)
  .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));

const index = files
  .map(f => {
    const date = f.replace('.json', '');
    const data = JSON.parse(readFileSync(join(cacheDir, f), 'utf8'));
    return { date, word: data.word };
  })
  .sort((a, b) => b.date.localeCompare(a.date));

writeFileSync(indexFile, JSON.stringify(index, null, 2), 'utf8');
console.log(`index.json uuendatud — ${index.length} kirjet.`);
