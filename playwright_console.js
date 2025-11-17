const { chromium } = require('playwright');

(async () => {
  const url = 'http://localhost:8123/HHHoerbuch%20Prox20%20Kkopie.html';
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  // Seed localStorage with an API token so the UI shows seeded balances (if code reads it)
  await context.addInitScript({ content: "localStorage.setItem('apiToken', 'test-token-123'); localStorage.setItem('hhb_api_token', 'test-token-123');" });
  const page = await context.newPage();
  // Intercept backend balance request and return a seeded balance so the UI displays credits
  await context.route('**/api/db/user', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, user: { kontingent_basis_tts: 123456, kontingent_premium_tts: 7890 } })
    }).catch(() => {});
  });

  page.on('console', msg => {
    const loc = msg.location ? msg.location() : null;
    try{
      if (loc && loc.url) {
        console.log(`[console:${msg.type()}] ${msg.text()} -- ${loc.url}:${loc.line}:${loc.column}`);
      } else {
        console.log(`[console:${msg.type()}] ${msg.text()}`);
      }
    }catch(e){
      console.log(`[console:${msg.type()}] (could not stringify)`);
    }
  });

  page.on('pageerror', err => {
    console.log(`[pageerror] ${err.message}\n${err.stack}`);
  });

  page.on('requestfailed', req => {
    console.log(`[requestfailed] ${req.url()} - ${req.failure().errorText}`);
  });

  try{
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  }catch(e){
    console.log('[goto-error]', e.message);
  }

  // Run a quick syntax check for each inline script by attempting to construct a Function.
  try {
    const scriptChecks = await page.evaluate(() => {
      return Array.from(document.scripts).map((s, idx) => {
        try {
          // Use Function to detect syntax errors (won't execute code)
          new Function(s.innerText || s.textContent || '');
          return null;
        } catch (err) {
          return { index: idx, message: err.message, stack: err.stack };
        }
      });
    });
    console.log('[script-syntax-check]', JSON.stringify(scriptChecks, null, 2));
  } catch (err) {
    console.log('[script-syntax-check-error]', err && err.message);
  }

  // Wait a bit for any delayed scripts (longer to allow balance fetch + UI update)
  await page.waitForTimeout(6000);

  // Take a screenshot for quick visual reference
  await page.screenshot({ path: 'hhb_playwright_screenshot.png', fullPage: true }).catch(()=>{});

  // Read credit balance shown in UI (if present)
  try {
    const creditText = await page.evaluate(() => {
      const el = document.getElementById('credit-balance');
      return el ? el.textContent : null;
    });
    console.log('[ui-credit-balance]', creditText);
  } catch (err) {
    console.log('[ui-credit-balance-error]', err && err.message);
  }

  // Trigger a quick conversion run: populate script, click convert and wait
  try {
    await page.evaluate(() => {
      try {
        localStorage.setItem('apiToken', 'test-token-123');
        localStorage.setItem('hhb_api_token', 'test-token-123');
        const bt = document.getElementById('book-text');
        if (bt) bt.value = 'Erzähler: Hallo Welt\nErzähler: Dies ist ein Test.';
        const btn = document.getElementById('convert-button');
        if (btn) btn.click();
      } catch(e){}
    });
    // wait for generation progress; this is arbitrary but sufficient for stubbed flow
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'hhb_playwright_after_convert.png', fullPage: true }).catch(()=>{});
  } catch (e) {
    console.log('[convert-run-error]', e && e.message);
  }

  await browser.close();
  console.log('--- PLAYWRIGHT_FINISHED ---');
})();
