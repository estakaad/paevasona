// Shared word-rendering logic — runs in both Node.js (build) and browser (ES module).
// No DOM APIs; pure string operations only.
// Used by: scripts/generate-pages.mjs (build) and inline <script type="module"> (browser).

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('et-EE', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function formatDateShort(str) {
  const [y, m, d] = str.split('-');
  return `${d}.${m}.${y}`;
}

// Returns the first plain-text definition from data, or ''.
export function getFirstDefinition(data) {
  for (const lex of (data.lexemes || [])) {
    if (lex.definitions && lex.definitions.length) {
      return lex.definitions[0].replace(/<[^>]+>/g, '').trim();
    }
  }
  return '';
}

// Returns the full HTML string for a word card's content area.
// Identical output to what renderWord() previously produced via innerHTML.
export function renderWordHtml(data) {
  const sonaveebiUrl = `https://sonaveeb.ee/search/unif/est/eki/${encodeURIComponent(data.word)}/1/est`;

  let html = `<div class="word-title"><a href="${sonaveebiUrl}" target="_blank" rel="noopener">${escapeHtml(data.word)}</a></div>`;

  const f = data.forms || {};
  const nounForms = ['SgN', 'SgG', 'SgP'].map(c => f[c]).filter(Boolean);
  const verbForms = ['Sup', 'Inf', 'IndPrSg3'].map(c => f[c]).filter(Boolean);
  const displayForms = nounForms.length >= 2 ? nounForms : verbForms.length >= 2 ? verbForms : [];
  if (displayForms.length) {
    html += `<div class="word-forms">${displayForms.map(escapeHtml).join(', ')}</div>`;
  }

  const lexemes = data.lexemes || [];
  if (!lexemes.length) {
    html += '<div class="no-data">Definitsioone ei leitud.</div>';
  } else {
    const posGroups = [];
    for (const lex of lexemes) {
      const posKey = (lex.pos || []).join('\x00');
      const last = posGroups[posGroups.length - 1];
      if (last && last.posKey === posKey) {
        last.lexemes.push(lex);
      } else {
        posGroups.push({ posKey, pos: lex.pos || [], lexemes: [lex] });
      }
    }

    for (const group of posGroups) {
      html += '<div class="pos-group">';
      if (group.pos.length) {
        html += `<div class="pos">${escapeHtml(group.pos.join(', '))}</div>`;
      }
      for (const lex of group.lexemes) {
        html += '<div class="lexeme">';
        if (lex.definitions && lex.definitions.length) {
          html += '<ol class="definitions" role="list">';
          for (const rawDef of lex.definitions) {
            const def = rawDef.replace(/<eki-foreign>/g, '<em>').replace(/<\/eki-foreign>/g, '</em>');
            html += `<li><span>${def}</span></li>`;
          }
          html += '</ol>';
        }
        if (lex.usages && lex.usages.length) {
          html += '<div class="word-examples">';
          for (const u of lex.usages) {
            const text = typeof u === 'string' ? u : u.text;
            let sourcesHtml = '';
            if (typeof u === 'object' && u.sources && u.sources.length) {
              const parts = u.sources.map(s => {
                if (typeof s === 'string') return escapeHtml(s);
                const label = escapeHtml(s.label || '');
                const detail = s.detail ? ` data-detail="${escapeHtml(s.detail)}"` : '';
                const interactive = s.detail ? ` role="button" tabindex="0" aria-expanded="false"` : '';
                return `<span class="usage-source-item"${detail}${interactive}>${label}</span>`;
              });
              sourcesHtml = `<span class="usage-source">${parts.join('; ')}</span>`;
            }
            html += `<div class="usage">${text}${sourcesHtml}</div>`;
          }
          html += '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
  }

  const year = data.date.slice(0, 4);
  html += `<div class="word-source">Allikas: ${escapeHtml(data.word)}. EKI ühendsõnastik ${year}. Eesti Keele Instituut, Sõnaveeb ${year}. <a href="${sonaveebiUrl}" target="_blank" rel="noopener">${sonaveebiUrl}</a> (<time datetime="${data.date}">${formatDateShort(data.date)}</time>)</div>`;

  return html;
}
