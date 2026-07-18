const { chromium } = require('C:/Users/Administrator/Code/Project/GoalXI/web/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('CONSOLE-ERR:', msg.text());
  });
  await page.goto('http://127.0.0.1:8000/zh/matches/a3094f8f-dac9-4cdb-a9f9-bf0f520435e8', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(4000);
  const result = await page.evaluate(() => {
    const chip = document.querySelector('[data-testid="pitch-stats-toggle"]');
    if (!chip) return { found: false };
    const rect = chip.getBoundingClientRect();
    const style = window.getComputedStyle(chip);
    const overlay = document.querySelector('[data-testid="pitch-stats-overlay"]');
    const pitch = document.querySelector('[data-testid="match-bento-layout"]')?.parentElement;
    return {
      found: true,
      visible: rect.width > 0 && rect.height > 0,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      text: chip.textContent.trim(),
      bg: style.backgroundColor,
      color: style.color,
      opacity: style.opacity,
      zIndex: style.zIndex,
      display: style.display,
      overlayPresent: !!overlay,
      pitchRect: pitch ? pitch.getBoundingClientRect() : null,
    };
  });
  console.log(JSON.stringify(result, null, 2));
  await page.screenshot({ path: 'C:/Users/Administrator/Code/Project/GoalXI/web/_chip_debug.png', fullPage: false });
  await browser.close();
})();
