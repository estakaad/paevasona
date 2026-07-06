// Build-time script: generates 1200×630 og:image PNGs for each date.
// Output: images/og/{date}.png  (skips dates that already have an image)
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
import { getFirstDefinition } from '../render-word.mjs';

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
const CARD_M = 30;
const SHADOW = 8;
const BORDER = 4;
const CARD_X = CARD_M;
const CARD_Y = CARD_M;
const CARD_W = W - CARD_M * 2;           // 1140
const CARD_H = H - CARD_M * 2 - SHADOW;  // 562
const PAD_H  = 72;                        // horizontal content padding
const PAD_V  = 48;                        // vertical content padding
const CONT_X = CARD_X + PAD_H;           // 102
const CONT_W = CARD_W - PAD_H * 2;       // 996

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

// Pick the largest font size (starting at 96px) that fits the word on one line.
function fitWordSize(ctx, word, maxW) {
  for (let size = 96; size >= 40; size -= 4) {
    ctx.font = `900 ${size}px Fraunces`;
    if (ctx.measureText(word).width <= maxW) return size;
  }
  return 40;
}

// ── Image renderer ────────────────────────────────────────────────────

async function generateOgImage(data) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

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

  let y = CARD_Y + PAD_V;

  // ── Row 1: date (left) + branding (right) ─────────────────────────
  const [yr, mo, dd] = data.date.split('-').map(Number);
  const dateStr = new Date(yr, mo - 1, dd)
    .toLocaleDateString('et-EE', { day: 'numeric', month: 'long', year: 'numeric' });
  ctx.font = '500 22px "Space Grotesk"';
  ctx.textBaseline = 'top';
  ctx.fillStyle = MUTED;
  ctx.fillText(dateStr, CONT_X, y);
  ctx.textAlign = 'right';
  ctx.fillText('p\u00e4evas\u00f5na.ee', CONT_X + CONT_W, y);
  ctx.textAlign = 'left';
  y += 28 + 14;

  // ── Word (auto-sized to fit one line) ──────────────────────────────
  const wordSize = fitWordSize(ctx, data.word, CONT_W);
  const LH_WORD  = Math.round(wordSize * 1.1);
  ctx.font = `900 ${wordSize}px Fraunces`;
  const wordLines = wrapLines(ctx, data.word, CONT_W);
  ctx.fillStyle = ACCENT;
  ctx.textBaseline = 'top';
  let wy = y;
  for (const line of wordLines) { ctx.fillText(line, CONT_X, wy); wy += LH_WORD; }
  y += wordLines.length * LH_WORD;

  // ── ACCENT2 underline strip ────────────────────────────────────────
  ctx.fillStyle = ACCENT2;
  ctx.fillRect(CONT_X, y + 6, CONT_W, 8);
  y += 6 + 8 + 18;

  // ── First definition only (teaser, max 3 lines) ────────────────────
  const firstDef = getFirstDefinition(data);
  if (firstDef) {
    ctx.font = '400 30px Lora';
    const defLines = wrapLines(ctx, firstDef, CONT_W).slice(0, 3);
    ctx.fillStyle = INK;
    ctx.textBaseline = 'top';
    let defY = y;
    for (const line of defLines) { ctx.fillText(line, CONT_X, defY); defY += 42; }
  }

  // ── Citation (anchored to card bottom) ────────────────────────────
  ctx.font = '500 19px "Space Grotesk"';
  ctx.fillStyle = MUTED;
  ctx.textBaseline = 'top';
  ctx.fillText(
    'Allikas: EKI \u00fchendsõnastik, Sõnaveeb',
    CONT_X,
    CARD_Y + CARD_H - PAD_V + 6,
  );

  return canvas.encode('png');
}

// ── Main ──────────────────────────────────────────────────────────────

const index = JSON.parse(readFileSync(join(ROOT, 'cache', 'index.json'), 'utf8'));
const outDir = join(ROOT, 'images', 'og');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

let generated = 0, skipped = 0;
for (const { date } of index) {
  const outFile  = join(outDir, `${date}.png`);
  if (existsSync(outFile)) { skipped++; continue; }
  const cacheFile = join(ROOT, 'cache', `${date}.json`);
  if (!existsSync(cacheFile)) { console.warn(`  SKIP: ${date}.json not found`); continue; }
  const data = JSON.parse(readFileSync(cacheFile, 'utf8'));
  const buf = await generateOgImage(data);
  writeFileSync(outFile, buf);
  generated++;
  process.stdout.write(`  ${date}: ${data.word}\n`);
}
console.log(`Generated ${generated} og:image PNGs → images/og/ (${skipped} already existed)`);
