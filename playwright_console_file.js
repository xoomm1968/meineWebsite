const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const filePath = path.join(__dirname, 'HHHoerbuch Prox20 Kkopie.html');
  const url = 'file://' + filePath;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    try{
      console.log(`[console:${msg.type()}] ${msg.text()}`);
    }catch(e){
      console.log(`[console:${msg.type()}] (could not stringify)`);
    }
  });

  page.on('pageerror', err => {
    console.log(`[pageerror] ${err.message}\n${err.stack}`);
  });

  page.on('requestfailed', req => {
    const failure = req.failure ? req.failure().errorText : 'unknown';
    console.log(`[requestfailed] ${req.url()} - ${failure}`);
  });

  try{
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  }catch(e){
    console.log('[goto-error]', e.message);
  }

  await page.waitForTimeout(3000);

  await page.screenshot({ path: 'hhb_playwright_file_screenshot.png', fullPage: true }).catch(()=>{});

  await browser.close();
  console.log('--- PLAYWRIGHT_FILE_FINISHED ---');
})();
