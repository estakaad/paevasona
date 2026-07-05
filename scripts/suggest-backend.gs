/**
 * Päevasõna — sõnaettepanekute vastuvõtmine
 * ============================================
 * HOW TO DEPLOY:
 *  1. Open your Google Sheet → Extensions → Apps Script
 *  2. Paste this entire file into the editor (replace any existing code)
 *  3. Click Deploy → New deployment
 *     - Type: Web App
 *     - Description: "Päevasõna suggestions"
 *     - Execute as: Me
 *     - Who has access: Anyone
 *  4. Click Deploy → authorise when prompted
 *  5. Copy the Web App URL (looks like https://script.google.com/macros/s/AKfy.../exec)
 *  6. Paste it into suggest.html where it says PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE
 *
 * NOTE: After any code change you must create a NEW deployment (not update an
 * existing one) for changes to take effect on the live URL.
 */

function doPost(e) {
  const respond = (data) =>
    ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);

  try {
    const body = JSON.parse(e.postData.contents);

    // ── Honeypot ───────────────────────────────────────────────────────────
    // Bots tend to fill every field; legitimate users never see this one.
    // Silently return success so the bot doesn't retry.
    if (body.website) return respond({ ok: true });

    // ── Sanitise ───────────────────────────────────────────────────────────
    const word    = stripTags(String(body.word    || '')).trim();
    const comment = stripTags(String(body.comment || '')).trim().slice(0, 500);
    const token   = String(body.token || '').replace(/[^a-z0-9]/gi, '').slice(0, 64);

    // ── Validate ───────────────────────────────────────────────────────────
    if (!word)              return respond({ ok: false, error: 'empty' });
    if (word.length > 50)   return respond({ ok: false, error: 'too_long' });

    // ── Rate-limit by session token (60-second window) ─────────────────────
    if (token) {
      const cache = CacheService.getScriptCache();
      const key   = 'sub_' + token;
      if (cache.get(key)) return respond({ ok: false, error: 'rate_limited' });
      cache.put(key, '1', 60);
    }

    // ── Write to "Ettepanekud" sheet ───────────────────────────────────────
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Ettepanekud');
    if (!sheet) {
      sheet = ss.insertSheet('Ettepanekud');
      sheet.appendRow(['Aeg', 'Sõna', 'Kommentaar']);
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([new Date(), word, comment]);

    return respond({ ok: true });

  } catch (err) {
    return respond({ ok: false, error: 'server_error' });
  }
}

// Strip HTML/script tags and angle brackets from user input.
function stripTags(str) {
  return str.replace(/<[^>]*>/g, '').replace(/[<>]/g, '');
}
