// share-image.mjs — Client-side PNG generation for word cards.
// Runs in the browser only (uses Canvas API, Font Loading API, Web Share API).

import { POS_LABELS } from './render-word.mjs';

const W = 1080;

// Card geometry
const CARD_M   = 40;              // gap between canvas edge and card
const SHADOW   = 10;              // neubrutalist shadow offset
const BORDER   = 4;               // card border width
const CARD_X   = CARD_M;
const CARD_W   = W - CARD_M * 2; // 1000
const PAD_H    = 68;              // horizontal padding inside card
const PAD_V    = 56;              // vertical padding inside card
const CONT_X   = CARD_X + PAD_H; // 108 — left edge of content
const CONT_W   = CARD_W - PAD_H * 2; // 864 — content width
const NUM_COL  = 62;              // width of definition-number column
const TEXT_X   = CONT_X + NUM_COL;   // 170 — definition text left edge
const TEXT_W   = CONT_W - NUM_COL;   // 802 — definition text max width

const MAX_DEFS = 5; // cap; show "+N tähendust veel" if exceeded

// Read colours from the page's active CSS palette at call time.
function getPalette() {
  const s = getComputedStyle(document.body);
  return {
    INK:     s.getPropertyValue('--color-ink').trim()     || '#1A1A1A',
    BG:      s.getPropertyValue('--color-bg').trim()      || '#F5F3ED',
    SURFACE: s.getPropertyValue('--color-surface').trim() || '#FFFFFF',
    ACCENT:  s.getPropertyValue('--color-accent').trim()  || '#3C2A78',
    ACCENT2: s.getPropertyValue('--color-accent-2').trim()|| '#D6E24A',
    MUTED:   '#666666',
  };
}

// Font specs (CSS font shorthand: style weight size family)
const F_WORD  = '900 88px Fraunces';
const F_FORMS = 'italic 500 25px "Space Grotesk"';
const F_POS   = '700 17px "Space Grotesk"';
const F_NUM   = '700 50px "Space Grotesk"';
const F_DEF   = '400 30px Lora';
const F_EX    = 'italic 400 27px Lora';
const F_MORE  = '500 23px "Space Grotesk"';
const F_DATE  = '500 21px "Space Grotesk"';
const F_WM    = '700 21px "Space Grotesk"';

// Line heights
const LH_WORD = 100;
const LH_DEF  = 42;
const LH_EX   = 40;

// ── Helpers ──────────────────────────────────────────────────────────

async function ensureFonts() {
  await Promise.all([
    document.fonts.load(F_WORD),
    document.fonts.load(F_NUM),
    document.fonts.load(F_FORMS),
    document.fonts.load(F_DEF),
    document.fonts.load(F_EX),
  ]);
}

// Wrap text to fit maxW, returning array of line strings.
function wrapLines(ctx, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (cur && ctx.measureText(test).width > maxW) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function stripHtml(str) {
  return str.replace(/<[^>]+>/g, '').trim();
}

// Group lexemes by consecutive POS (same logic as render-word.mjs).
// Each posGroup keeps its lexemes separate so usages stay bound to their lexeme.
function buildSections(data) {
  const posGroups = [];
  for (const lex of (data.lexemes || [])) {
    const key = (lex.pos || []).join('\x00');
    const last = posGroups[posGroups.length - 1];
    if (last && last.key === key) {
      last.lexemes.push(lex);
    } else {
      posGroups.push({ key, pos: lex.pos || [], lexemes: [lex] });
    }
  }
  return posGroups.map(group => ({
    posLabel: group.pos.map(p => POS_LABELS[p] || p).join(', '),
    lexemes: group.lexemes.map(lex => {
      const u = lex.usages?.[0];
      return {
        defs: (lex.definitions || []).map(stripHtml),
        firstUsage: u ? (typeof u === 'string' ? u : u.text) : null,
      };
    }),
  }));
}

// ── Two-pass layout ───────────────────────────────────────────────────
//
// layoutContent(ctx, data, startY, draw)
//   • draw=false — only sets ctx.font for measureText; no drawing.
//   • draw=true  — renders everything onto ctx starting at startY.
//   • Returns the height of the content block (excluding card padding).
//
// Using a single function for both passes guarantees the height
// calculation and draw positions are always identical.

function layoutContent(ctx, data, startY, draw, p) {
  let y = startY;

  // Helper: call fn() only during the draw pass
  const ink = (fn) => { if (draw) fn(); };

  const { INK, BG, SURFACE, ACCENT, ACCENT2, MUTED } = p || {};

  // ── Date ──────────────────────────────────────────────────────────
  ctx.font = F_DATE;
  const [yr, mo, dy] = data.date.split('-').map(Number);
  const dateStr = new Date(yr, mo - 1, dy)
    .toLocaleDateString('et-EE', { day: 'numeric', month: 'long', year: 'numeric' });
  ink(() => {
    ctx.textBaseline = 'top';
    ctx.fillStyle = MUTED;
    ctx.fillText(dateStr, CONT_X, y);
  });
  y += 26 + 18;

  // ── Word ──────────────────────────────────────────────────────────
  ctx.font = F_WORD;
  const wordLines = wrapLines(ctx, data.word, CONT_W);
  ink(() => {
    ctx.textBaseline = 'top';
    ctx.fillStyle = ACCENT;
    let wy = y;
    for (const l of wordLines) { ctx.fillText(l, CONT_X, wy); wy += LH_WORD; }
  });
  y += wordLines.length * LH_WORD + 10;

  y += 20;

  // ── Sections (POS groups → lexemes → defs + usage) ───────────────
  const sections = buildSections(data);

  // Apply MAX_DEFS cap across all lexemes; track remaining for "+N" indicator.
  let defsLeft = MAX_DEFS;
  let remaining = 0;
  const capped = [];
  for (const group of sections) {
    if (defsLeft <= 0) {
      remaining += group.lexemes.reduce((s, l) => s + l.defs.length, 0);
      continue;
    }
    const cappedLexemes = [];
    for (const lex of group.lexemes) {
      if (defsLeft <= 0) { remaining += lex.defs.length; continue; }
      const take = Math.min(lex.defs.length, defsLeft);
      cappedLexemes.push({ ...lex, defs: lex.defs.slice(0, take) });
      defsLeft -= take;
      remaining += lex.defs.length - take;
    }
    if (cappedLexemes.length) capped.push({ ...group, lexemes: cappedLexemes });
  }

  let globalNum = 0;
  for (let si = 0; si < capped.length; si++) {
    const group = capped[si];

    // Dashed divider between POS groups
    if (si > 0) {
      y += 10;
      ink(() => {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.moveTo(CONT_X, y); ctx.lineTo(CONT_X + CONT_W, y); ctx.stroke();
        ctx.setLineDash([]);
      });
      y += 2 + 22;
    }

    // POS badge
    if (group.posLabel) {
      const label = group.posLabel.toUpperCase();
      ctx.font = F_POS;
      const bw = ctx.measureText(label).width + 22;
      const bh = 26;
      ink(() => {
        ctx.fillStyle = ACCENT2;
        ctx.fillRect(CONT_X, y, bw, bh);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(CONT_X, y, bw, bh);
        ctx.fillStyle = INK;
        ctx.textBaseline = 'middle';
        ctx.fillText(label, CONT_X + 11, y + bh / 2);
      });
      y += bh + 18;
    }

    // Each lexeme: its definitions, then its usage
    for (const lex of group.lexemes) {
      for (const def of lex.defs) {
        globalNum++;
        ctx.font = F_DEF;
        const defLines = wrapLines(ctx, def, TEXT_W);
        const blockH = Math.max(58, defLines.length * LH_DEF + 6);

        ink(() => {
          ctx.font = F_NUM;
          ctx.fillStyle = ACCENT;
          ctx.textBaseline = 'top';
          ctx.fillText(String(globalNum), CONT_X, y);

          ctx.font = F_DEF;
          ctx.fillStyle = INK;
          ctx.textBaseline = 'top';
          let ty = y + 8;
          for (const line of defLines) { ctx.fillText(line, TEXT_X, ty); ty += LH_DEF; }
        });
        y += blockH + 12;
      }

      // Usage example for this lexeme (shown after its defs)
      if (lex.firstUsage) {
        const EX_INDENT = 22;
        ctx.font = F_EX;
        const exLines = wrapLines(ctx, lex.firstUsage, CONT_W - EX_INDENT);
        const exH = exLines.length * LH_EX;
        ink(() => {
          ctx.fillStyle = ACCENT;
          ctx.fillRect(CONT_X, y, 4, exH);
          ctx.font = F_EX;
          ctx.fillStyle = INK;
          ctx.textBaseline = 'top';
          let ey = y;
          for (const line of exLines) { ctx.fillText(line, CONT_X + EX_INDENT, ey); ey += LH_EX; }
        });
        y += exH + 20;
      }
    }
  }

  // "+N more" indicator
  if (remaining > 0) {
    ctx.font = F_MORE;
    ink(() => {
      ctx.fillStyle = MUTED;
      ctx.textBaseline = 'top';
      ctx.fillText(`+${remaining} tähendust veel`, CONT_X, y);
    });
    y += 28 + 10;
  }

  // ── Source citation ───────────────────────────────────────────────
  y += 10;
  const year = data.date.slice(0, 4);
  const sourceText = `Allikas: ${data.word}. EKI ühendsõnastik ${year}. Eesti Keele Instituut, Sõnaveeb ${year}.`;
  ctx.font = F_DATE;
  const sourceLines = wrapLines(ctx, sourceText, CONT_W);
  ink(() => {
    ctx.fillStyle = MUTED;
    ctx.textBaseline = 'top';
    let sy = y;
    for (const line of sourceLines) { ctx.fillText(line, CONT_X, sy); sy += 26; }
  });
  y += sourceLines.length * 26 + 16;

  // ── Bottom separator + watermark ──────────────────────────────────
  y += 4;
  ink(() => {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(CONT_X, y); ctx.lineTo(CONT_X + CONT_W, y); ctx.stroke();
  });
  y += 2 + 18;

  ctx.font = F_WM;
  ink(() => {
    ctx.fillStyle = MUTED;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillText('päevasõna.ee', W / 2, y);
    ctx.textAlign = 'left';
  });
  y += 26;

  return y - startY; // total content height
}

// ── Main export ───────────────────────────────────────────────────────

export async function generateAndShareImage(data) {
  // Ensure web fonts are loaded before measuring/drawing
  await ensureFonts();

  // Read active palette from the page
  const p = getPalette();

  // Pass 1: measure content height (no drawing, just font metrics)
  const mc = document.createElement('canvas');
  mc.width = W; mc.height = 100;
  const contentH = layoutContent(mc.getContext('2d'), data, 0, false, p);

  // Compute canvas dimensions
  const CARD_Y = CARD_M;
  const CARD_H = PAD_V + contentH + PAD_V;
  const CANVAS_H = CARD_Y + CARD_H + SHADOW + CARD_M;

  // Pass 2: draw
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');

  // Page background
  ctx.fillStyle = p.BG;
  ctx.fillRect(0, 0, W, CANVAS_H);

  // Neubrutalist shadow (filled rect, offset)
  ctx.fillStyle = p.INK;
  ctx.fillRect(CARD_X + SHADOW, CARD_Y + SHADOW, CARD_W, CARD_H);

  // Card surface
  ctx.fillStyle = p.SURFACE;
  ctx.fillRect(CARD_X, CARD_Y, CARD_W, CARD_H);

  // Card border (inset by half lineWidth so stroke stays inside the card)
  ctx.strokeStyle = p.INK;
  ctx.lineWidth = BORDER;
  ctx.setLineDash([]);
  ctx.strokeRect(CARD_X + BORDER / 2, CARD_Y + BORDER / 2, CARD_W - BORDER, CARD_H - BORDER);

  // Content
  layoutContent(ctx, data, CARD_Y + PAD_V, true, p);

  // Copy PNG to clipboard
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
  });
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
