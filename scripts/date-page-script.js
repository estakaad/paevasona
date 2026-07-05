// Client-side script for pre-rendered per-date pages (e.g. /2026-07-03/index.html).
// Embedded verbatim inside <script type="module"> by generate-pages.mjs.
// Import paths resolve relative to the HTML document URL, not this file.

import { renderWordHtml, formatDate } from '../render-word.mjs';
import { generateAndShareImage } from '../share-image.mjs';

// Capture stable base URLs before any pushState changes the document URL.
const cacheBase = new URL('../cache/', window.location.href).href;
const datesBase = new URL('../', window.location.href).href;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateNav(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('et-EE', { day: 'numeric', month: 'long' });
}

function getAdjacentDates(date) {
  const sorted = [...availableDates].sort();
  let prevDate = null, nextDate = null;
  for (const d of sorted) {
    if (d < date) prevDate = d;
    if (d > date && nextDate === null) nextDate = d;
  }
  return { prevDate, nextDate };
}

function updateNavButtons(date) {
  const { prevDate, nextDate } = getAdjacentDates(date);
  // Desktop side arrows
  const btnPrevFixed = document.getElementById('btn-prev-fixed');
  const btnNextFixed = document.getElementById('btn-next-fixed');
  if (prevDate) {
    const label = formatDateNav(prevDate);
    btnPrevFixed.setAttribute('aria-label', 'Eelmine sõna: ' + label);
    document.getElementById('label-prev-fixed').textContent = label;
    btnPrevFixed.style.visibility = 'visible';
  } else {
    btnPrevFixed.style.visibility = 'hidden';
    document.getElementById('label-prev-fixed').textContent = '';
  }
  if (nextDate) {
    const label = formatDateNav(nextDate);
    btnNextFixed.setAttribute('aria-label', 'Järgmine sõna: ' + label);
    document.getElementById('label-next-fixed').textContent = label;
    btnNextFixed.style.visibility = 'visible';
  } else {
    btnNextFixed.style.visibility = 'hidden';
    document.getElementById('label-next-fixed').textContent = '';
  }
  // Mobile bottom bar
  const btnPrevMobile = document.getElementById('btn-prev-mobile');
  const btnNextMobile = document.getElementById('btn-next-mobile');
  if (prevDate) {
    const label = formatDateNav(prevDate);
    btnPrevMobile.disabled = false;
    btnPrevMobile.setAttribute('aria-label', 'Eelmine sõna: ' + label);
    document.getElementById('label-prev-mobile').textContent = label;
  } else {
    btnPrevMobile.disabled = true;
    document.getElementById('label-prev-mobile').textContent = 'Eelmine';
  }
  if (nextDate) {
    const label = formatDateNav(nextDate);
    btnNextMobile.disabled = false;
    btnNextMobile.setAttribute('aria-label', 'Järgmine sõna: ' + label);
    document.getElementById('label-next-mobile').textContent = label;
  } else {
    btnNextMobile.disabled = true;
    document.getElementById('label-next-mobile').textContent = 'Järgmine';
  }
}

let availableDates = new Set();
let currentData = null;

// Determine which date this page is for from the URL path (e.g. /paevasona/2026-07-03/).
const pathMatch = window.location.pathname.match(/\/(\d{4}-\d{2}-\d{2})\/?$/);
let currentDate = pathMatch ? pathMatch[1] : todayStr();

async function loadWord(date) {
  const content = document.getElementById('word-content');
  const dateEl = document.getElementById('date-display');
  dateEl.textContent = formatDate(date);
  dateEl.setAttribute('datetime', date);
  document.getElementById('btn-prev-fixed').style.visibility = 'hidden';
  document.getElementById('btn-next-fixed').style.visibility = 'hidden';
  document.getElementById('btn-prev-mobile').disabled = true;
  document.getElementById('btn-next-mobile').disabled = true;
  document.getElementById('btn-share').hidden = true;
  content.innerHTML = '<div class="no-data">Laadimine...</div>';
  try {
    const res = await fetch(cacheBase + date + '.json?v=3');
    if (!res.ok) throw new Error('not found');
    const data = await res.json();
    currentData = data;
    content.innerHTML = renderWordHtml(data);
    document.title = `P\u00e4eva s\u00f5na \u2013 ${data.word}`;
    // document.getElementById('btn-share').hidden = false;
    updateNavButtons(date);
  } catch {
    content.innerHTML = `<div class="empty-state">
      <p class="empty-state-msg">Vai-vai, polegi s\u00f5na!</p>
      <button class="empty-state-btn" id="btn-random-err">Vaata suvakat s\u00f5na</button>
    </div>`;
    document.getElementById('btn-random-err').addEventListener('click', goRandom);
    updateNavButtons(date);
  }
}

function trackPageview(path) {
  if (window.goatcounter?.count) window.goatcounter.count({ path });
}

function navigate(n) {
  const { prevDate, nextDate } = getAdjacentDates(currentDate);
  const target = n < 0 ? prevDate : nextDate;
  if (!target) return;
  currentDate = target;
  history.pushState(null, '', datesBase + target + '/');
  trackPageview('/' + target + '/');
  loadWord(currentDate);
}

function goRandom() {
  const today = todayStr();
  const dates = [...availableDates].filter(d => d !== today);
  if (!dates.length) return;
  const date = dates[Math.floor(Math.random() * dates.length)];
  currentDate = date;
  history.pushState(null, '', datesBase + date + '/');
  trackPageview('/' + date + '/');
  loadWord(date);
}

// ── Tooltip ──────────────────────────────────────

const sourceTooltip = document.createElement('div');
sourceTooltip.id = 'source-tooltip';
sourceTooltip.className = 'source-tooltip';
sourceTooltip.setAttribute('role', 'tooltip');
document.body.appendChild(sourceTooltip);

function positionTooltip(item) {
  const rect = item.getBoundingClientRect();
  const tw = sourceTooltip.offsetWidth;
  const th = sourceTooltip.offsetHeight;
  let left = rect.left + window.scrollX;
  let top = rect.bottom + window.scrollY + 6;
  if (rect.left + tw > window.innerWidth - 8) left = window.scrollX + window.innerWidth - tw - 8;
  if (rect.bottom + th + 6 > window.innerHeight) top = rect.top + window.scrollY - th - 6;
  sourceTooltip.style.left = left + 'px';
  sourceTooltip.style.top = top + 'px';
}

function showTooltip(item) {
  sourceTooltip.textContent = item.dataset.detail;
  sourceTooltip.style.left = '-9999px';
  sourceTooltip.style.top = '-9999px';
  sourceTooltip.classList.add('visible');
  item.setAttribute('aria-expanded', 'true');
  item.setAttribute('aria-describedby', 'source-tooltip');
  positionTooltip(item);
}

function hideTooltip(item) {
  sourceTooltip.classList.remove('visible');
  if (item) {
    item.setAttribute('aria-expanded', 'false');
    item.removeAttribute('aria-describedby');
  }
}

document.addEventListener('click', function(e) {
  const item = e.target.closest('[data-detail]');
  if (item) {
    e.stopPropagation();
    if (item.getAttribute('aria-expanded') === 'true') {
      hideTooltip(item);
    } else {
      const prev = document.querySelector('[data-detail][aria-expanded="true"]');
      if (prev) hideTooltip(prev);
      showTooltip(item);
    }
  } else {
    const active = document.querySelector('[data-detail][aria-expanded="true"]');
    if (active) hideTooltip(active);
  }
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const active = document.querySelector('[data-detail][aria-expanded="true"]');
    if (active) { hideTooltip(active); active.focus(); }
    return;
  }
  if (e.key === 'Enter' || e.key === ' ') {
    const item = e.target.closest('[data-detail]');
    if (item) {
      e.preventDefault();
      if (item.getAttribute('aria-expanded') === 'true') {
        hideTooltip(item);
      } else {
        const prev = document.querySelector('[data-detail][aria-expanded="true"]');
        if (prev) hideTooltip(prev);
        showTooltip(item);
      }
    }
  }
});

document.getElementById('btn-prev-fixed').addEventListener('click', () => navigate(-1));
document.getElementById('btn-next-fixed').addEventListener('click', () => navigate(1));
document.getElementById('btn-prev-mobile').addEventListener('click', () => navigate(-1));
document.getElementById('btn-next-mobile').addEventListener('click', () => navigate(1));
document.getElementById('btn-random-mobile').addEventListener('click', goRandom);
document.getElementById('btn-random').addEventListener('click', goRandom);

const shareBtn = document.getElementById('btn-share');
const shareBtnLabel = shareBtn.innerHTML;
shareBtn.addEventListener('click', async () => {
  if (!currentData || shareBtn.disabled) return;
  shareBtn.disabled = true;
  try {
    await generateAndShareImage(currentData);
    shareBtn.innerHTML = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    shareBtn.setAttribute('aria-label', 'Kopeeritud!');
    setTimeout(() => { shareBtn.disabled = false; shareBtn.innerHTML = shareBtnLabel; shareBtn.setAttribute('aria-label', 'Kopeeri pildina'); }, 2000);
  } catch (e) {
    console.error('Copy failed:', e);
    shareBtn.disabled = false;
    shareBtn.innerHTML = shareBtnLabel;
  }
});

fetch(cacheBase + 'index.json')
  .then(r => r.json())
  .then(index => {
    availableDates = new Set(index.map(e => e.date));
    if (document.getElementById('word-content').querySelector('.word-title')) {
      // Hydration: content already pre-rendered; fetch data quietly for share button
      updateNavButtons(currentDate);
      fetch(cacheBase + currentDate + '.json?v=3')
        .then(r => r.json())
        .then(data => {
          currentData = data;
          // document.getElementById('btn-share').hidden = false;
        })
        .catch(() => {});
    } else {
      loadWord(currentDate);
    }
  })
  .catch(() => loadWord(currentDate));
