// Fetch a list of words from Ekilex and generate preview.html for local testing.
// Run: node scripts/fetch-preview.mjs
// Output: preview.html (open in browser via local server, e.g. npx serve .)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { renderWordHtml, escapeHtml } from '../render-word.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const envPath = join(ROOT, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}
const API_KEY = process.env.EKILEX_API_KEY;
const API_URL = process.env.EKILEX_API_URL || 'https://ekilex.ee';

const WORDS = [
  'naksitrall','leema','pakilt-palavalt','abiööbik','karvakala',
  'aplaager','kõhuvari','möhmus','laiskliisu','näpuviluks',
  'murikas','nadu','kuradinahkne','hola','rannarihv',
  'sübariit','sinekuur','kabajantsik','kunskopp','aiduraidutama',
  'mana','muts','uri','flanöör','alfons',
  'supivalgus','luuslank','olbama','ramb','tohuvabohu',
  'tondinahk','puudama','jupastama','lell','untsantsakas',
  'ponks','nurgavoodi','seebiks','tseugma','umbluu',
  'tutske','helepala','imb','pudulojus','kromlehh',
  'kanäe','aadamakahvel','pära','ruja','küdi',
  'tondipiibel','uih-aih','justament','nääl','kukepea',
  'hea-parem','rebad','käli','virvatuli','nõnge',
  'lähike','kilb','sõge','virvarr','sabarakk',
  'teal','kipukas','vooster','kirevane','ajekas',
  'tolk','türp','lillutama','ääri-veeri','peps',
  'ülevise','läbi-lõhki','kögöš-mögöš','kreeps','mitu-setu',
  'küpsiküüsi','jõss','krell','kaim','väitama',
  'koogelmoogel','henseldama','koduväi','lemm','pigilind',
  'udu-umbe',
];

const CONCURRENCY = 5;

async function fetchWord(word) {
  // Step 1: get wordId
  const idsRes = await fetch(
    `${API_URL}/api/word/ids/${encodeURIComponent(word)}/eki/est`,
    { headers: { 'ekilex-api-key': API_KEY } }
  );
  if (!idsRes.ok) throw new Error(`ids ${idsRes.status}`);
  const wordIds = await idsRes.json();
  if (!wordIds.length) throw new Error('not found in Ekilex');
  const wordId = wordIds[0];

  // Step 2: word details
  const details = await fetch(
    `${API_URL}/api/word/details/${wordId}/eki`,
    { headers: { 'ekilex-api-key': API_KEY } }
  ).then(r => r.json());

  // Step 3: paradigm forms
  const FORM_CODES = new Set(['SgN', 'SgG', 'SgP', 'Sup', 'Inf', 'IndPrSg3']);
  const forms = {};
  try {
    const paradigms = await fetch(
      `${API_URL}/api/paradigm/details/${wordId}`,
      { headers: { 'ekilex-api-key': API_KEY } }
    ).then(r => r.json());
    for (const p of paradigms) {
      if (p.secondary) continue;
      for (const f of (p.paradigmForms || [])) {
        if (FORM_CODES.has(f.morphCode) && f.morphExists && f.value && !forms[f.morphCode])
          forms[f.morphCode] = f.value;
      }
    }
  } catch {}

  // Step 4: source details
  const sourceIds = new Set();
  for (const lex of (details.lexemes || []))
    for (const u of (lex.usages || []))
      for (const s of (u.sourceLinks || []))
        if (s.sourceId) sourceIds.add(s.sourceId);
  const sourceDetails = {};
  for (const sourceId of sourceIds) {
    try {
      const r = await fetch(`${API_URL}/api/source/details/${sourceId}`, { headers: { 'ekilex-api-key': API_KEY } });
      if (r.ok) { const s = await r.json(); sourceDetails[sourceId] = s.value || s.name || null; }
    } catch {}
  }

  const lexemes = (details.lexemes || []).map(lex => ({
    dataset: lex.datasetCode,
    pos: (lex.pos || []).map(p => p.code).filter(Boolean),
    definitions: ((lex.meaning && lex.meaning.definitions) || [])
      .filter(d => d.lang === 'est' && d.wwUnif === true)
      .map(d => d.valuePrese || d.value),
    usages: (lex.usages || [])
      .filter(u => u.lang === 'est')
      .map(u => ({
        text: u.valuePrese || u.value,
        sources: (u.sourceLinks || [])
          .map(s => ({
            label: [s.sourceName, s.name].filter(Boolean).join(', '),
            detail: s.sourceId ? (sourceDetails[s.sourceId] || null) : null,
          }))
          .filter(s => s.label),
      }))
      .slice(0, 3),
  }));

  return { date: 'preview', word, wordId, forms, lexemes };
}

// Run with limited concurrency
async function fetchAll(words, concurrency) {
  const results = new Array(words.length);
  let idx = 0;
  async function worker() {
    while (idx < words.length) {
      const i = idx++;
      const word = words[i];
      process.stdout.write(`  [${i + 1}/${words.length}] ${word} ... `);
      try {
        results[i] = { ok: true, data: await fetchWord(word) };
        console.log('ok');
      } catch (e) {
        results[i] = { ok: false, word, error: e.message };
        console.log(`SKIP (${e.message})`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

console.log(`Fetching ${WORDS.length} words (concurrency ${CONCURRENCY})...`);
const results = await fetchAll(WORDS, CONCURRENCY);

// Build preview HTML
const cards = results.map(r => {
  if (!r.ok) {
    return `<section class="preview-entry">
  <div class="preview-label preview-label--err">${escapeHtml(r.word)}</div>
  <div class="word-card"><div class="no-data">${escapeHtml(r.error)}</div></div>
</section>`;
  }
  const { data } = r;
  const hasDefs = data.lexemes.some(l => l.definitions.length > 0);
  const warnClass = hasDefs ? '' : ' preview-label--warn';
  return `<section class="preview-entry" id="${escapeHtml(data.word)}">
  <div class="preview-label${warnClass}">${escapeHtml(data.word)}</div>
  <div class="word-card">
    <div class="word-card-top"><time class="word-card-date">eelvaade</time></div>
    <div id="word-content">${renderWordHtml(data)}</div>
  </div>
</section>`;
}).join('\n');

const toc = results.map(r => {
  if (!r.ok) return `<li class="toc-err"><a href="#${encodeURIComponent(r.word)}">${escapeHtml(r.word)}</a></li>`;
  const hasDefs = r.data.lexemes.some(l => l.definitions.length > 0);
  return `<li class="${hasDefs ? '' : 'toc-warn'}"><a href="#${encodeURIComponent(r.data.word)}">${escapeHtml(r.data.word)}</a></li>`;
}).join('\n');

const ok = results.filter(r => r.ok).length;
const skipped = results.filter(r => !r.ok).length;
const noDefs = results.filter(r => r.ok && !r.data.lexemes.some(l => l.definitions.length > 0)).length;

const html = `<!DOCTYPE html>
<html lang="et">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sõnade eelvaade</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Lora:ital,wght@0,400;1,400&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
  <style>
    body { max-width: none; padding: 0; }
    .preview-layout { display: flex; min-height: 100vh; }
    .preview-toc { position: sticky; top: 0; height: 100vh; overflow-y: auto; width: 180px; flex-shrink: 0; border-right: 2px solid var(--color-ink); padding: 1rem 0.75rem; font-family: 'Space Grotesk', sans-serif; font-size: 0.8rem; background: var(--color-bg); }
    .preview-toc h2 { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 0.75rem; }
    .preview-toc ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
    .preview-toc a { color: var(--color-ink); text-decoration: none; }
    .preview-toc a:hover { text-decoration: underline; }
    .toc-warn a { color: #b45309; }
    .toc-err a { color: #dc2626; text-decoration: line-through; }
    .preview-main { flex: 1; padding: 2rem; display: flex; flex-direction: column; gap: 3rem; max-width: 640px; }
    .preview-entry {}
    .preview-label { font-family: 'Space Grotesk', sans-serif; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-ink); opacity: 0.4; margin-bottom: 0.5rem; }
    .preview-label--warn { color: #b45309; opacity: 1; }
    .preview-label--err { color: #dc2626; opacity: 1; }
    .preview-stats { font-family: 'Space Grotesk', sans-serif; font-size: 0.8rem; padding: 0.5rem 0.75rem; background: var(--color-surface); border: 2px solid var(--color-ink); margin-bottom: 1rem; }
  </style>
</head>
<body class="palette-4">
<div class="preview-layout">
  <nav class="preview-toc">
    <h2>Sõnad (${ok}/${results.length})</h2>
    <ul>${toc}</ul>
  </nav>
  <div class="preview-main">
    <div class="preview-stats">
      Fetched: <strong>${ok}</strong> &nbsp;|&nbsp;
      Skipped: <strong>${skipped}</strong> &nbsp;|&nbsp;
      No wwUnif defs: <strong>${noDefs}</strong>
    </div>
    ${cards}
  </div>
</div>
<script type="module">
import { renderWordHtml } from './render-word.mjs';
// Source tooltip
const sourceTooltip = document.createElement('div');
sourceTooltip.id = 'source-tooltip';
sourceTooltip.className = 'source-tooltip';
sourceTooltip.setAttribute('role', 'tooltip');
document.body.appendChild(sourceTooltip);
function positionTooltip(item) {
  const rect = item.getBoundingClientRect();
  const tw = sourceTooltip.offsetWidth, th = sourceTooltip.offsetHeight;
  let left = rect.left + window.scrollX, top = rect.bottom + window.scrollY + 6;
  if (rect.left + tw > window.innerWidth - 8) left = window.scrollX + window.innerWidth - tw - 8;
  if (rect.bottom + th + 6 > window.innerHeight) top = rect.top + window.scrollY - th - 6;
  sourceTooltip.style.left = left + 'px'; sourceTooltip.style.top = top + 'px';
}
document.addEventListener('click', e => {
  const item = e.target.closest('[data-detail]');
  if (item) {
    e.stopPropagation();
    if (item.getAttribute('aria-expanded') === 'true') {
      sourceTooltip.classList.remove('visible'); item.setAttribute('aria-expanded','false');
    } else {
      const prev = document.querySelector('[data-detail][aria-expanded="true"]');
      if (prev) { sourceTooltip.classList.remove('visible'); prev.setAttribute('aria-expanded','false'); }
      sourceTooltip.textContent = item.dataset.detail;
      sourceTooltip.style.cssText = 'left:-9999px;top:-9999px';
      sourceTooltip.classList.add('visible');
      item.setAttribute('aria-expanded','true');
      positionTooltip(item);
    }
  } else {
    const a = document.querySelector('[data-detail][aria-expanded="true"]');
    if (a) { sourceTooltip.classList.remove('visible'); a.setAttribute('aria-expanded','false'); }
  }
});
</script>
</body>
</html>`;

writeFileSync(join(ROOT, 'preview.html'), html, 'utf8');
console.log(`\nDone. ${ok} ok, ${skipped} skipped, ${noDefs} without wwUnif definitions.`);
console.log('Avage preview.html (nt: npx serve . → http://localhost:3000/preview.html)');
