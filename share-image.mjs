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
const F_DATE  = '500 21px "Space Grotesk"';
const F_SRC   = '500 18px "Space Grotesk"';

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
    lexemes: group.lexemes.map(lex => ({
      defs: (lex.definitions || []).map(stripHtml),
      usages: (lex.usages || []).map(u => {
        if (typeof u === 'string') return { text: u, sourceLabel: '' };
        const label = (u.sources || []).map(s => s.label || '').filter(Boolean).join('; ');
        return { text: u.text || '', sourceLabel: label };
      }).filter(u => u.text),
    })),
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

  // ── Date (left) + branding (right) ───────────────────────────────
  ctx.font = F_DATE;
  const [yr, mo, dy] = data.date.split('-').map(Number);
  const dateStr = new Date(yr, mo - 1, dy)
    .toLocaleDateString('et-EE', { day: 'numeric', month: 'long', year: 'numeric' });
  ink(() => {
    ctx.textBaseline = 'top';
    ctx.fillStyle = MUTED;
    ctx.fillText(dateStr, CONT_X, y);
    ctx.textAlign = 'right';
    ctx.fillText('p\u00e4evas\u00f5na.ee', CONT_X + CONT_W, y);
    ctx.textAlign = 'left';
  });
  y += 26 + 18;

  // ── Word + accent underline ────────────────────────────────────────
  ctx.font = F_WORD;
  const wordLines = wrapLines(ctx, data.word, CONT_W);
  const UNDERLINE_GAP = 6;
  const UNDERLINE_H   = 8;
  ink(() => {
    ctx.textBaseline = 'top';
    ctx.fillStyle = ACCENT;
    let wy = y;
    for (const l of wordLines) { ctx.fillText(l, CONT_X, wy); wy += LH_WORD; }
    // Thick ACCENT2 strip directly below the word
    ctx.fillStyle = ACCENT2;
    ctx.fillRect(CONT_X, y + wordLines.length * LH_WORD + UNDERLINE_GAP, CONT_W, UNDERLINE_H);
  });
  y += wordLines.length * LH_WORD + UNDERLINE_GAP + UNDERLINE_H + 14;

  // ── Morphology forms ──────────────────────────────────────────────
  const f = data.forms || {};
  const nounForms = ['SgN', 'SgG', 'SgP'].map(c => f[c]).filter(Boolean);
  const verbForms = ['Sup', 'Inf', 'IndPrSg3'].map(c => f[c]).filter(Boolean);
  const displayForms = nounForms.length >= 2 ? nounForms : verbForms.length >= 2 ? verbForms : [];
  if (displayForms.length) {
    ctx.font = F_FORMS;
    ink(() => {
      ctx.textBaseline = 'top';
      ctx.fillStyle = MUTED;
      ctx.fillText(displayForms.join(', '), CONT_X, y);
    });
    y += 32 + 6;
  }

  y += 20;

  // ── Sections (POS groups → lexemes → defs + usages) ─────────────
  const sections = buildSections(data);

  let globalNum = 0;
  for (let si = 0; si < sections.length; si++) {
    const group = sections[si];

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

      // All usage examples for this lexeme — one continuous border for the group
      if (lex.usages.length > 0) {
        const EX_INDENT = 22;
        const EX_BETWEEN = 14; // gap between consecutive examples in one group
        const SRC_H = 24;      // height of the source label line
        ctx.font = F_EX;
        const allExItems = lex.usages.map(u => ({
          lines: wrapLines(ctx, u.text, CONT_W - EX_INDENT),
          sourceLabel: u.sourceLabel,
        }));
        const totalExH = allExItems.reduce((sum, item, i) => {
          let h = item.lines.length * LH_EX;
          if (item.sourceLabel) h += SRC_H;
          if (i < allExItems.length - 1) h += EX_BETWEEN;
          return sum + h;
        }, 0);
        const groupY = y;
        ink(() => {
          ctx.fillStyle = ACCENT;
          ctx.fillRect(CONT_X, groupY, 4, totalExH);
        });
        for (let ei = 0; ei < allExItems.length; ei++) {
          const { lines, sourceLabel } = allExItems[ei];
          ink(() => {
            ctx.font = F_EX;
            ctx.fillStyle = INK;
            ctx.textBaseline = 'top';
            let ey = y;
            for (const line of lines) { ctx.fillText(line, CONT_X + EX_INDENT, ey); ey += LH_EX; }
          });
          y += lines.length * LH_EX;
          if (sourceLabel) {
            ink(() => {
              ctx.font = F_SRC;
              ctx.fillStyle = MUTED;
              ctx.textBaseline = 'top';
              ctx.fillText(sourceLabel, CONT_X + EX_INDENT, y);
            });
            y += SRC_H;
          }
          if (ei < allExItems.length - 1) y += EX_BETWEEN;
        }
        y += 22; // gap after the usage group
      }
    }
  }

  // ── Source citation ───────────────────────────────────────────────
  y += 10;
  const year = data.date.slice(0, 4);
  const sonaveebiUrl = `https://sonaveeb.ee/search/unif/est/eki/${encodeURIComponent(data.word)}/1/est`;
  const sourceText = `Allikas: ${data.word}. EKI \u00fchendsõnastik ${year}. Eesti Keele Instituut, S\u00f5naveeb ${year}. ${sonaveebiUrl}`;
  ctx.font = F_DATE;
  const sourceLines = wrapLines(ctx, sourceText, CONT_W);
  ink(() => {
    ctx.fillStyle = MUTED;
    ctx.textBaseline = 'top';
    let sy = y;
    for (const line of sourceLines) { ctx.fillText(line, CONT_X, sy); sy += 26; }
  });
  y += sourceLines.length * 26;

  return y - startY; // total content height
}

// ── generateImageBlob ─────────────────────────────────────────────────

export async function generateImageBlob(data) {
  await ensureFonts();
  const p = getPalette();

  // Pass 1: measure
  const mc = document.createElement('canvas');
  mc.width = W; mc.height = 100;
  const contentH = layoutContent(mc.getContext('2d'), data, 0, false, p);

  const CARD_Y  = CARD_M;
  const CARD_H  = PAD_V + contentH + PAD_V;
  const CANVAS_H = CARD_Y + CARD_H + SHADOW + CARD_M;

  // Pass 2: draw
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = p.BG;
  ctx.fillRect(0, 0, W, CANVAS_H);
  ctx.fillStyle = p.INK;
  ctx.fillRect(CARD_X + SHADOW, CARD_Y + SHADOW, CARD_W, CARD_H);
  ctx.fillStyle = p.SURFACE;
  ctx.fillRect(CARD_X, CARD_Y, CARD_W, CARD_H);
  ctx.strokeStyle = p.INK;
  ctx.lineWidth = BORDER;
  ctx.setLineDash([]);
  ctx.strokeRect(CARD_X + BORDER / 2, CARD_Y + BORDER / 2, CARD_W - BORDER, CARD_H - BORDER);
  layoutContent(ctx, data, CARD_Y + PAD_V, true, p);

  return new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
  );
}

// ── Modal ─────────────────────────────────────────────────────────────

let _overlay = null;
let _escCleanup = null;

function getOrCreateModal() {
  if (_overlay) return _overlay;
  const el = document.createElement('div');
  el.className = 'share-modal-overlay';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Jaga sõna');
  el.innerHTML =
    '<div class="share-modal">' +
      '<div class="share-modal-preview">' +
        '<button class="share-modal-close" aria-label="Sulge">\u2715</button>' +
        '<img class="share-modal-img" alt="P\u00e4eva s\u00f5na kaart" hidden>' +
        '<p class="share-modal-status"></p>' +
      '</div>' +
      '<div class="share-modal-actions">' +
        '<button class="share-modal-action" data-action="copy" disabled>Kopeeri</button>' +
        '<button class="share-modal-action" data-action="download" disabled>Laadi alla</button>' +
        '<button class="share-modal-action" data-action="native" hidden>Jaga</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(el);
  _overlay = el;
  return el;
}

export async function openShareModal(data) {
  const overlay  = getOrCreateModal();
  const img      = overlay.querySelector('.share-modal-img');
  const status   = overlay.querySelector('.share-modal-status');
  const btnClose = overlay.querySelector('.share-modal-close');
  const btnCopy  = overlay.querySelector('[data-action="copy"]');
  const btnDL    = overlay.querySelector('[data-action="download"]');
  const btnNative = overlay.querySelector('[data-action="native"]');

  // Reset to loading state
  img.hidden = true; img.src = '';
  status.hidden = false; status.textContent = 'Genereerin\u2026'; status.style.color = '';
  btnCopy.disabled = true; btnCopy.textContent = 'Kopeeri';
  btnDL.disabled = true;
  btnNative.hidden = true;

  const prevFocus = document.activeElement;
  let blob = null;
  let objectUrl = null;

  function close() {
    overlay.hidden = true;
    document.body.style.overflow = '';
    if (_escCleanup) { _escCleanup(); _escCleanup = null; }
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    prevFocus?.focus();
  }

  btnClose.onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  if (_escCleanup) _escCleanup();
  const escHandler = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', escHandler);
  _escCleanup = () => document.removeEventListener('keydown', escHandler);

  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  btnClose.focus();

  // Generate
  try {
    blob = await generateImageBlob(data);
    if (overlay.hidden) return; // dismissed while generating
    objectUrl = URL.createObjectURL(blob);
    img.src = objectUrl;
    img.hidden = false;
    status.hidden = true;
    btnCopy.disabled = false;
    btnDL.disabled = false;

    // Web Share API: feature-detect file sharing support
    try {
      const probe = new File([blob], 'probe.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [probe] })) btnNative.hidden = false;
    } catch (_) {}

  } catch (_) {
    status.textContent = 'Pildi genereerimine ebaõnnestus.';
    status.style.color = 'var(--color-accent)';
  }

  // ── Action handlers ───────────────────────────────
  const filename = `paevasona-${data.word}-${data.date}.png`;

  btnCopy.onclick = async () => {
    if (!blob) return;
    const orig = btnCopy.textContent;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      btnCopy.textContent = 'Kopeeritud!';
    } catch (_) {
      btnCopy.textContent = 'Viga!';
    }
    setTimeout(() => { btnCopy.textContent = orig; }, 1500);
  };

  btnDL.onclick = () => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  btnNative.onclick = async () => {
    if (!blob) return;
    try {
      await navigator.share({
        files: [new File([blob], filename, { type: 'image/png' })],
        title: `P\u00e4eva s\u00f5na \u2013 ${data.word}`,
      });
    } catch (e) {
      if (e.name !== 'AbortError') console.error('Share failed:', e);
    }
  };
}
