// Build-time script: generates 1200×630 og:image PNGs for each date.
// Output: images/og/{date}.png
//
// Run after sync-sheet.mjs, before generate-pages.mjs:
//   node scripts/generate-og-images.mjs
//
// Requires: @napi-rs/canvas (npm install)
// Fonts: fonts/Fraunces-900.woff2, fonts/SpaceGrotesk-500.woff2, fonts/Lora-400.woff2

import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getFirstDefinition, POS_LABELS } from '../render-word.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Fonts ────────────────────────────────────────────────────────────
GlobalFonts.registerFromPath(join(ROOT, 'fonts', 'Fraunces-900.woff2'), 'Fraunces');
GlobalFonts.registerFromPath(join(ROOT, 'fonts', 'SpaceGrotesk-500.woff2'), 'Space Grotesk');
GlobalFonts.registerFromPath(join(ROOT, 'fonts', 'Lora-400.woff2'), 'Lora');

// ── Palette (palette-4) ───────────────────────────────────────────────
const INK     = '#1A1A1A';
const BG      = '#F5F3ED';
const SURFACE = '#FFFFFF';
const ACCENT  = '#3C2A78';
const ACCENT2 = '#D6E24A';
const MUTED   = '#666666';

// ── Canvas geometry ───────────────────────────────────────────────────
const W      = 1200;
const H      = 630;
const CARD_M = 36;
const SHADOW = 8;
const BORDER = 4;
const CARD_X = CARD_M;
const CARD_Y = CARD_M;
const CARD_W = W - CARD_M * 2;           // 1128
const CARD_H = H - CARD_M * 2 - SHADOW;  // 550
const PAD_H  = 72;
const PAD_V  = 52;
const CONT_X = CARD_X + PAD_H;           // 108
const CONT_W = CARD_W - PAD_H * 2;       // 984

// ── Helpers ───────────────────────────────────────────────────────────

function wrapLines(ctx, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (cur && ctx.measureText(test).width > maxW) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Pick the largest font size (starting 96px, stepping by 4) that keeps
// the word on a single line within maxW.
function fitWordSize(ctx, word, maxW) {
  for (let size = 96; size >= 40; size -= 4) {
    ctx.font = `900 ${size}px Fraunces`;
    if (ctx.measureText(word).width <= maxW) return size;
  }
  return 40;
}

function getPosLabel(data) {
  const pos = data.lexemes?.[0]?.pos || [];
  return pos.map(p => POS_LABELS[p] || p).join(', ');
}

// ── Image renderer ────────────────────────────────────────────────────

async function generateOgImage(data) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ── Pre-compute all layout measurements ──────────────────────────

  // Word
  const wordSize = fitWordSize(ctx, data.word, CONT_W);
  const LH_WORD  = Math.round(wordSize * 1.1);
  ctx.font = `900 ${wordSize}px Fraunces`;
  const wordLines = wrapLines(ctx, data.word, CONT_W);

  // Definition (max 3 lines)
  ctx.font = '400 30px Lora';
  const firstDef = getFirstDefinition(data);
  const defLines = firstDef ? wrapLines(ctx, firstDef, CONT_W).slice(0, 3) : [];

  // POS badge
  const posLabel = getPosLabel(data);
  const posUpper = posLabel.toUpperCase();
  ctx.font = '500 15px "Space Grotesk"';
  const posW = posLabel ? ctx.measureText(posUpper).width + 24 : 0;
  const POS_H = 26;

  // Full citation (same format as main site's word source line)
  const year = data.date.slice(0, 4);
  const citeText = `Allikas: ${data.word}. EKI \u00fchendsõnastik ${year}. Eesti Keele Instituut, S\u00f5naveeb ${year}.`;
  ctx.font = '500 17px "Space Grotesk"';
  const citeLines = wrapLines(ctx, citeText, CONT_W);
  const citeH = citeLines.length * 24;

  // Main block total height (word + underline + def + POS)
  const mainH = (
    wordLines.length * LH_WORD +
    6 + 8 + 18 +                                                // underline (gap + strip + gap-below)
    (defLines.length > 0 ? defLines.length * 42 : 0) +          // definition lines
    (defLines.length > 0 && posLabel ? 16 : 0) +                // gap def → POS
    (posLabel ? POS_H : 0)
  );

  // ── Vertical zone layout ──────────────────────────────────────────
  // Header (date + branding) is anchored to the top of the content area.
  // Citation is anchored to the bottom.
  // Everything in between is vertically centered.

  const HEADER_H   = 28;     // height of the date/branding row
  const HEADER_GAP = 22;     // gap between header row and centered block
  const FOOTER_GAP = 18;     // gap between centered block and citation

  const headerY = CARD_Y + PAD_V;
  const footerY = CARD_Y + CARD_H - PAD_V - citeH;  // top of citation

  const zoneTop = headerY + HEADER_H + HEADER_GAP;
  const zoneBot = footerY - FOOTER_GAP;
  const mainY   = zoneTop + Math.max(0, Math.round((zoneBot - zoneTop - mainH) / 2));

  // ── Draw ──────────────────────────────────────────────────────────

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // Card shadow (neubrutalist offset)
  ctx.fillStyle = INK;
  ctx.fillRect(CARD_X + SHADOW, CARD_Y + SHADOW, CARD_W, CARD_H);

  // Card surface
  ctx.fillStyle = SURFACE;
  ctx.fillRect(CARD_X, CARD_Y, CARD_W, CARD_H);

  // Card border
  ctx.strokeStyle = INK;
  ctx.lineWidth = BORDER;
  ctx.setLineDash([]);
  ctx.strokeRect(CARD_X + BORDER / 2, CARD_Y + BORDER / 2, CARD_W - BORDER, CARD_H - BORDER);

  // Header row: date (left) + branding (right)
  const [yr, mo, dd] = data.date.split('-').map(Number);
  const dateStr = new Date(yr, mo - 1, dd)
    .toLocaleDateString('et-EE', { day: 'numeric', month: 'long', year: 'numeric' });
  ctx.font = '500 22px "Space Grotesk"';
  ctx.textBaseline = 'top';
  ctx.fillStyle = MUTED;
  ctx.fillText(dateStr, CONT_X, headerY);
  ctx.textAlign = 'right';
  ctx.fillText('p\u00e4evas\u00f5na.ee', CONT_X + CONT_W, headerY);
  ctx.textAlign = 'left';

  // ── Main content block (vertically centered) ──────────────────────
  let y = mainY;

  // Word
  ctx.font = `900 ${wordSize}px Fraunces`;
  ctx.fillStyle = ACCENT;
  ctx.textBaseline = 'top';
  let wy = y;
  for (const line of wordLines) { ctx.fillText(line, CONT_X, wy); wy += LH_WORD; }
  y += wordLines.length * LH_WORD;

  // ACCENT2 underline strip
  ctx.fillStyle = ACCENT2;
  ctx.fillRect(CONT_X, y + 6, CONT_W, 8);
  y += 6 + 8 + 18;

  // First definition
  if (defLines.length > 0) {
    ctx.font = '400 30px Lora';
    ctx.fillStyle = INK;
    ctx.textBaseline = 'top';
    let defY = y;
    for (const line of defLines) { ctx.fillText(line, CONT_X, defY); defY += 42; }
    y += defLines.length * 42;
    if (posLabel) y += 16;
  }

  // POS badge (ACCENT2 fill, INK border + text)
  if (posLabel) {
    ctx.font = '500 15px "Space Grotesk"';
    ctx.fillStyle = ACCENT2;
    ctx.fillRect(CONT_X, y, posW, POS_H);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(CONT_X, y, posW, POS_H);
    ctx.fillStyle = INK;
    ctx.textBaseline = 'middle';
    ctx.fillText(posUpper, CONT_X + 12, y + POS_H / 2);
  }

  // ── Footer: full citation anchored to bottom ──────────────────────
  ctx.font = '500 17px "Space Grotesk"';
  ctx.fillStyle = MUTED;
  ctx.textBaseline = 'top';
  let citeY = footerY;
  for (const line of citeLines) { ctx.fillText(line, CONT_X, citeY); citeY += 24; }

  return canvas.encode('png');
}

// ── Main ──────────────────────────────────────────────────────────────

const index = JSON.parse(readFileSync(join(ROOT, 'cache', 'index.json'), 'utf8'));
const outDir = join(ROOT, 'images', 'og');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

let generated = 0;
for (const { date } of index) {
  const cacheFile = join(ROOT, 'cache', `${date}.json`);
  if (!existsSync(cacheFile)) { console.warn(`  SKIP: ${date}.json not found`); continue; }
  const data = JSON.parse(readFileSync(cacheFile, 'utf8'));
  const buf = await generateOgImage(data);
  writeFileSync(join(outDir, `${date}.png`), buf);
  generated++;
  process.stdout.write(`  ${date}: ${data.word}\n`);
}
console.log(`Generated ${generated} og:image PNGs → images/og/`);
