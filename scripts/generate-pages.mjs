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
  const sonaveebiUrl = `https://sonaveeb.ee/search/unif/est/eki/${encodeURIComponent(word)}/1/est`;

  const firstDef = getFirstDefinition(data);
  const description = truncate(firstDef || `${word} \u2013 P\u00e4eva s\u00f5na ${date}`, 155);
  const escapedTitle = escapeHtml(word) + ' \u2013 P\u00e4eva s\u00f5na';
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
${canonicalUrl ? `  <meta property="og:url" content="${canonicalUrl}">` : ''}
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapedTitle}">
  <meta name="twitter:description" content="${escapedDesc}">
  <script type="application/ld+json">${jsonLd}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Lora:ital,wght@0,400;1,400&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../style.css">
</head>
<body class="palette-4">
  <header>
    <a href="../">P\u00e4eva s\u00f5na</a>
    <span class="page-title">iga p\u00e4ev uus s\u00f5na</span>
  </header>

  <main>
    <div class="word-card" id="word-card">
      <div class="word-card-top">
        <span class="word-card-date" id="date-display">${escapeHtml(formattedDate)}</span>
      </div>
      <div id="word-content">${preRenderedHtml}</div>
    </div>

    <nav>
      <button id="btn-prev">&#8592;</button>
      <button id="btn-next">&#8594;</button>
    </nav>
  </main>

  <div class="footer-links">
    <button id="btn-random">Suvakas</button>
    <a href="../archive.html">Arhiiv</a>
    <a href="../info.html">Info</a>
  </div>

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
