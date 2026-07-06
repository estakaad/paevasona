// Build-time script: generates a pre-rendered index.html for every date in cache/index.json,
// plus sitemap.xml and robots.txt.
//
// Run manually:  node scripts/generate-pages.mjs
// In CI:         SITE_URL=https://user.github.io/repo node scripts/generate-pages.mjs
//
// SITE_URL is required for canonical/og:url tags and sitemap absolute URLs.
// Without it, those fields are omitted (pages still work, just lack canonical hints).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { renderWordHtml, getFirstDefinition, formatDate, escapeHtml } from '../render-word.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');

// Embedded verbatim as the body of <script type="module"> in each date page.
// Imports inside it resolve relative to the HTML document URL (not this file).
const datePageScript = readFileSync(join(__dirname, 'date-page-script.js'), 'utf8');

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '\u2026';
}

function buildDatePageHtml(data) {
  const { word, date } = data;
  const canonicalUrl = SITE_URL ? `${SITE_URL}/${date}/` : '';
  const ogImageUrl   = SITE_URL ? `${SITE_URL}/images/og/${date}.png` : '';
  const sonaveebiUrl = `https://sonaveeb.ee/search/unif/est/eki/${encodeURIComponent(word)}/1/est`;

  const firstDef = getFirstDefinition(data);
  const description = truncate(firstDef || `${word} \u2013 P\u00e4eva s\u00f5na ${date}`, 155);
  const escapedTitle = 'P\u00e4eva s\u00f5na \u2013 ' + escapeHtml(word);
  const escapedDesc = escapeHtml(description);

  // Prevent </script> inside JSON-LD from breaking the tag.
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: word,
    description: firstDef || description,
    ...(canonicalUrl ? { url: canonicalUrl } : {}),
    sameAs: sonaveebiUrl,
    inDefinedTermSet: {
      '@type': 'DefinedTermSet',
      name: 'EKI \u00fchendsõnastik',
      url: 'https://sonaveeb.ee',
    },
  }).replace(/</g, '\\u003c');

  const preRenderedHtml = renderWordHtml(data);
  const formattedDate = formatDate(date);

  return `<!DOCTYPE html>
<html lang="et">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedTitle}</title>
  <meta name="description" content="${escapedDesc}">
${canonicalUrl ? `  <link rel="canonical" href="${canonicalUrl}">` : ''}
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapedTitle}">
  <meta property="og:description" content="${escapedDesc}">
${canonicalUrl ? `  <meta property="og:url" content="${canonicalUrl}">` : ''}${ogImageUrl ? `\n  <meta property="og:image" content="${ogImageUrl}">\n  <meta property="og:image:width" content="1200">\n  <meta property="og:image:height" content="630">` : ''}
  <meta name="twitter:card" content="${ogImageUrl ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${escapedTitle}">
  <meta name="twitter:description" content="${escapedDesc}">
${ogImageUrl ? `  <meta name="twitter:image" content="${ogImageUrl}">` : ''}
  <script type="application/ld+json">${jsonLd}</script>
  <link rel="alternate" type="application/rss+xml" title="P\u00e4eva s\u00f5na" href="../feed.xml">
  <link rel="icon" type="image/svg+xml" href="../favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="../favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="../favicon-16x16.png">
  <link rel="apple-touch-icon" sizes="180x180" href="../apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Lora:ital,wght@0,400;1,400&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../style.css">
</head>
<body class="palette-4">
  <a href="#word-content" class="skip-link">Mine sisu juurde</a>
  <header>
    <a href="../">P\u00e4eva s\u00f5na</a>
    <span class="page-title">iga p\u00e4ev uus s\u00f5na</span>
  </header>

  <main>
    <div class="word-card" id="word-card">
      <div class="word-card-top">
        <time class="word-card-date" id="date-display" datetime="${date}">${escapeHtml(formattedDate)}</time>
        <button class="share-btn" id="btn-share" hidden aria-label="Jaga s\\u00f5na">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </button>
      </div>
      <div id="word-content" aria-live="polite" aria-atomic="true" tabindex="-1">${preRenderedHtml}</div>
    </div>

  <button class="fixed-nav fixed-nav--prev" id="btn-prev-fixed" aria-label="Eelmine s\u00f5na" style="visibility:hidden">
    <span class="fixed-nav-arrow">&#8592;</span>
    <span class="fixed-nav-label" id="label-prev-fixed"></span>
  </button>
  <button class="fixed-nav fixed-nav--next" id="btn-next-fixed" aria-label="J\u00e4rgmine s\u00f5na" style="visibility:hidden">
    <span class="fixed-nav-arrow">&#8594;</span>
    <span class="fixed-nav-label" id="label-next-fixed"></span>
  </button>
  </main>

  <div class="mobile-nav" role="navigation" aria-label="Navigeerimine">
    <button class="mobile-nav-btn" id="btn-prev-mobile" aria-label="Eelmine s\u00f5na" disabled>
      <span class="mobile-nav-arrow">&#8592;</span>
      <span class="mobile-nav-label" id="label-prev-mobile">Eelmine</span>
    </button>
    <button class="mobile-nav-btn" id="btn-next-mobile" aria-label="J\u00e4rgmine s\u00f5na" disabled>
      <span class="mobile-nav-arrow">&#8594;</span>
      <span class="mobile-nav-label" id="label-next-mobile">J\u00e4rgmine</span>
    </button>
    <button class="mobile-nav-btn" id="btn-random-mobile">Suvakas</button>
    <a class="mobile-nav-btn" href="../archive.html">Arhiiv</a>
    <a class="mobile-nav-btn" href="../info.html">Info</a>
  </div>

  <div class="footer-links">
    <button id="btn-random">Suvakas</button>
    <a href="../archive.html">Arhiiv</a>
    <a href="../info.html">Info</a>
  </div>

  <script data-goatcounter="https://paevasona.goatcounter.com/count"
          async src="//gc.zgo.at/count.js"></script>
  <script type="module">
${datePageScript}
  </script>
</body>
</html>`;
}

// --- Generate per-date pages ---
const index = JSON.parse(readFileSync(join(ROOT, 'cache', 'index.json'), 'utf8'));
let generated = 0;

for (const { date } of index) {
  const cacheFile = join(ROOT, 'cache', `${date}.json`);
  if (!existsSync(cacheFile)) {
    console.warn(`  SKIP: ${date}.json not found`);
    continue;
  }
  const data = JSON.parse(readFileSync(cacheFile, 'utf8'));
  const outDir = join(ROOT, date);
  if (!existsSync(outDir)) mkdirSync(outDir);
  writeFileSync(join(outDir, 'index.html'), buildDatePageHtml(data), 'utf8');
  generated++;
}

console.log(`Generated ${generated} date pages.`);

// --- sitemap.xml (requires SITE_URL) ---
if (SITE_URL) {
  const entries = [
    `  <url>\n    <loc>${SITE_URL}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    ...index.map(({ date }) =>
      `  <url>\n    <loc>${SITE_URL}/${date}/</loc>\n    <lastmod>${date}</lastmod>\n    <changefreq>never</changefreq>\n    <priority>0.8</priority>\n  </url>`
    ),
  ].join('\n');

  writeFileSync(
    join(ROOT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`,
    'utf8'
  );
  console.log(`Generated sitemap.xml with ${index.length + 1} URLs.`);
} else {
  console.log('SITE_URL not set — skipping sitemap.xml.');
}

// --- robots.txt (always regenerated so CI can add/update the Sitemap line) ---
const robotsPath = join(ROOT, 'robots.txt');
const sitemapLine = SITE_URL ? `\nSitemap: ${SITE_URL}/sitemap.xml` : '';
writeFileSync(robotsPath, `User-agent: *\nAllow: /${sitemapLine}\n`, 'utf8');
console.log('Generated robots.txt.');

// --- feed.xml (requires SITE_URL) ---
const RSS_LIMIT = 50;
const RFC822_DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const RFC822_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function toRfc822(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Estonia: EEST UTC+3 (Apr–Oct), EET UTC+2 (Nov–Mar)
  const tz = (m >= 4 && m <= 10) ? '+0300' : '+0200';
  const dow = RFC822_DAYS[new Date(y, m - 1, d).getDay()];
  return `${dow}, ${String(d).padStart(2, '0')} ${RFC822_MONTHS[m - 1]} ${y} 00:00:00 ${tz}`;
}

function xmlEsc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

if (SITE_URL) {
  const feedEntries = index.slice(0, RSS_LIMIT);
  const lastBuildDate = feedEntries.length ? toRfc822(feedEntries[0].date) : '';

  const items = feedEntries.map(({ date, word }) => {
    const cacheFile = join(ROOT, 'cache', `${date}.json`);
    let def = '';
    if (existsSync(cacheFile)) {
      def = truncate(getFirstDefinition(JSON.parse(readFileSync(cacheFile, 'utf8'))), 300);
    }
    const url = `${SITE_URL}/${date}/`;
    return `    <item>
      <title>${xmlEsc(word)}</title>
      <link>${xmlEsc(url)}</link>
      <guid isPermaLink="true">${xmlEsc(url)}</guid>
      <pubDate>${toRfc822(date)}</pubDate>
      <description>${xmlEsc(def)}</description>
    </item>`;
  }).join('\n');

  const feedUrl = `${SITE_URL}/feed.xml`;
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>P\u00e4eva s\u00f5na</title>
    <link>${xmlEsc(SITE_URL)}/</link>
    <description>Eesti keele huvitavad ja harvad s\u00f5nad iga p\u00e4ev</description>
    <language>et</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${xmlEsc(feedUrl)}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
  writeFileSync(join(ROOT, 'feed.xml'), rss, 'utf8');
  console.log(`Generated feed.xml with ${feedEntries.length} items.`);
} else {
  console.log('SITE_URL not set \u2014 skipping feed.xml.');
}
