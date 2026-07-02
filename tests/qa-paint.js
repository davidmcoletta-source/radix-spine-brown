// Playwright QA for the body-paint symptom localizer.
// Run: node qa-paint.js   (server must be running on :8731)
const { chromium } = require('playwright');

const BASE = 'http://localhost:8731/index.html?nocache=' + Date.now() + '#symptom';
const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || '' });
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (detail ? '  (' + detail + ')' : ''));
}

// Mark via real PointerEvents dispatched in-page on the canvas: one full
// pointerdown+pointerup click per point, matching the click-to-mark UX.
// Coordinates are normalized (0..1) over the canvas; the bounding rect is
// re-read for every event so this is robust to any layout/scroll changes.
async function paintRegion(page, pts) {
  await page.evaluate((P) => {
    const c = document.querySelector('#paint-canvas');
    const mk = (t, nx, ny) => {
      const rect = c.getBoundingClientRect();
      return new PointerEvent(t, {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse',
        clientX: rect.left + nx * rect.width, clientY: rect.top + ny * rect.height,
      });
    };
    for (const p of P) {
      c.dispatchEvent(mk('pointerdown', p[0], p[1]));
      const up = mk('pointerup', p[0], p[1]);
      c.dispatchEvent(up); window.dispatchEvent(up);
    }
  }, pts);
  await page.waitForTimeout(250);
}
// A series of click points from (nx0,ny0) to (nx1,ny1) with n samples.
function line(nx0, ny0, nx1, ny1, n) {
  const a = []; for (let i = 0; i < n; i++) { const t = i / (n - 1); a.push([nx0 + (nx1 - nx0) * t, ny0 + (ny1 - ny0) * t]); } return a;
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERR: ' + e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__paint && window.__paint.ready(), { timeout: 20000 });
  check('masks build for all paint roots', Object.keys(await page.evaluate(() => window.__paint.maskArea())).length === 11);

  const scrollTop = async () => { await page.evaluate(() => document.querySelector('#paint-stage').scrollIntoView({ block: 'start' })); await page.waitForTimeout(120); };
  const box = async () => page.locator('#paint-canvas').boundingBox();
  const top = async () => page.evaluate(() => ({
    root: document.querySelector('#paint-top-root').textContent,
    conf: document.querySelector('#paint-confidence').textContent,
    stamps: window.__paint.stampCount(), strokes: window.__paint.strokeCount(),
    scores: window.__paint.scores().slice(0, 3).map(s => ({ r: s.root, s: +s.score.toFixed(2) })),
  }));

  // ---- Territory tests (real pointer events) ----
  // L5: lateral leg, posterior figure (nx~0.62, ny 0.66-0.78)
  await page.evaluate(() => window.__paint.clearAll());
  await scrollTop();
  await paintRegion(page, line(0.62, 0.66, 0.62, 0.78, 12));
  let t = await top(); check('L5 territory -> L5 #1', t.root === 'L5', JSON.stringify(t.scores));
  check('each click places exactly one mark', t.stamps === 12 && t.strokes === 12, `stamps ${t.stamps} strokes ${t.strokes}`);

  // ---- Layout stability: marking must not move the canvas as results update ----
  await page.evaluate(() => window.__paint.clearAll());
  await scrollTop();
  const b0 = await box();
  await paintRegion(page, line(0.15, 0.50, 0.17, 0.53, 8));
  await page.waitForTimeout(400);
  const b1 = await box();
  check('canvas stays put while results update',
    Math.abs(b0.x - b1.x) < 1 && Math.abs(b0.y - b1.y) < 1,
    `dx=${(b1.x - b0.x).toFixed(2)} dy=${(b1.y - b0.y).toFixed(2)}`);

  // C6: radial forearm / thumb, anterior (nx~0.15, ny~0.50)
  await page.evaluate(() => window.__paint.clearAll());
  await scrollTop();
  await paintRegion(page, line(0.15, 0.50, 0.17, 0.53, 14));
  t = await top(); check('C6 territory -> C6 #1', t.root === 'C6', JSON.stringify(t.scores));
  check('no side claim in confidence label', !/left|right|both/.test(t.conf), t.conf);

  // S1: posterior calf / lateral foot, posterior figure (nx~0.635, ny 0.88-0.90)
  await page.evaluate(() => window.__paint.clearAll());
  await scrollTop();
  await paintRegion(page, line(0.635, 0.880, 0.635, 0.897, 10));
  t = await top(); check('S1 territory -> S1 #1', t.root === 'S1', JSON.stringify(t.scores));

  // Result cards must not claim a body side anywhere.
  const sideText = await page.evaluate(() => {
    const el = document.querySelector('#paint-ranked-results');
    return el ? el.textContent : '';
  });
  check('result cards never claim left/right', !/\bleft\b|\bright\b|both sides/i.test(sideText));

  // ---- Eraser ----
  await page.evaluate(() => window.__paint.clearAll());
  await scrollTop();
  await paintRegion(page, line(0.15, 0.50, 0.17, 0.53, 16));
  const beforeErase = (await top()).stamps;
  await page.click('[data-brush="eraser"]');
  await scrollTop();
  await paintRegion(page, line(0.15, 0.50, 0.17, 0.53, 16));
  const afterErase = (await top()).stamps;
  check('eraser removes stamps', afterErase < beforeErase, `before ${beforeErase} after ${afterErase}`);

  // ---- Undo ----
  await page.click('[data-brush="pain"]');
  await page.evaluate(() => window.__paint.clearAll());
  await scrollTop();
  await paintRegion(page, line(0.15, 0.50, 0.17, 0.53, 8));
  await scrollTop();
  await paintRegion(page, line(0.62, 0.66, 0.62, 0.78, 8));
  const sBefore = (await top()).strokes;
  await page.click('[data-paint-undo]');
  await page.waitForTimeout(150);
  const sAfter = (await top()).strokes;
  check('undo removes one stroke', sAfter === sBefore - 1, `before ${sBefore} after ${sAfter}`);

  // ---- Clear ----
  await page.click('[data-paint-clear]');
  await page.waitForTimeout(150);
  const cleared = await top();
  check('clear all resets', cleared.strokes === 0 && cleared.root === '\u2014', JSON.stringify({ st: cleared.strokes, r: cleared.root }));

  // ---- Tool switching reflects in DOM ----
  await page.click('[data-brush="numbness"]');
  const numbActive = await page.evaluate(() => document.querySelector('[data-brush="numbness"]').classList.contains('is-active') &&
    document.querySelector('[data-brush="pain"]').getAttribute('aria-checked') === 'false');
  check('tool switching updates active state', numbActive);

  // ---- Mode toggle (Paint / List) ----
  await page.click('[data-symptom-mode="list"]');
  await page.waitForTimeout(150);
  const listShown = await page.evaluate(() => {
    const paintPane = document.querySelector('[data-symptom-pane="paint"]');
    const listPane = document.querySelector('[data-symptom-pane="list"]');
    return paintPane.hidden === true && listPane.hidden === false &&
      !!document.querySelector('#symptom-drawing-builder .symptom-layer-card');
  });
  check('List mode shows existing layer input', listShown);
  // back to paint
  await page.click('[data-symptom-mode="paint"]');
  await page.waitForTimeout(150);
  const paintShown = await page.evaluate(() => document.querySelector('[data-symptom-pane="paint"]').hidden === false);
  check('Paint mode restored', paintShown);

  // ---- Scoring still works after toggling back (uses data.js weights) ----
  await page.evaluate(() => window.__paint.clearAll());
  await scrollTop();
  await paintRegion(page, line(0.15, 0.50, 0.17, 0.53, 14));
  check('scores after mode round-trip', (await top()).root === 'C6');

  // ---- No horizontal overflow at 1280 ----
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('no horizontal overflow @1280', !overflow);

  // ---- Screenshots: 1280 light + dark with marks ----
  await scrollTop();
  await page.screenshot({ path: '/home/user/workspace/qa-paint-1280-light.png' });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/home/user/workspace/qa-paint-1280-dark.png' });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));

  // ---- Mobile 375 ----
  await page.setViewportSize({ width: 375, height: 780 });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__paint.clearAll());
  await scrollTop();
  await paintRegion(page, line(0.15, 0.50, 0.17, 0.53, 14));
  const mt = await top();
  check('mobile paint scores (C6)', mt.root === 'C6', JSON.stringify(mt.scores));
  overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('no horizontal overflow @375', !overflow);

  // Scroll prevention: the canvas must declare touch-action:none and cancel
  // touchmove so a finger drag paints instead of scrolling the page. (Synthetic
  // PointerEvents can't trigger native scroll, so we verify the mechanism itself:
  // touch-action is none and a real touchmove is preventDefault-ed.)
  const scrollGuard = await page.evaluate(() => {
    const c = document.querySelector('#paint-canvas');
    const ta = getComputedStyle(c).touchAction;
    const ev = new Event('touchmove', { bubbles: true, cancelable: true });
    c.dispatchEvent(ev);
    return { ta, prevented: ev.defaultPrevented };
  });
  check('canvas prevents touch-scroll while painting (mobile)',
    scrollGuard.ta === 'none' && scrollGuard.prevented === true,
    `touch-action=${scrollGuard.ta} prevented=${scrollGuard.prevented}`);

  await scrollTop();
  await page.screenshot({ path: '/home/user/workspace/qa-paint-375-light.png' });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/home/user/workspace/qa-paint-375-dark.png' });

  // ---- Canvas alignment on resize ----
  await page.setViewportSize({ width: 1100, height: 1000 });
  await page.waitForTimeout(300);
  const aligned = await page.evaluate(() => {
    // The canvas must overlay the figure (base image) exactly so painted marks
    // land on the right dermatome. Compare canvas vs image rects (both sit inside
    // the stage's 1px border, so comparing to the stage would be off by ~2px).
    const img = document.querySelector('#paint-base-img').getBoundingClientRect();
    const c = document.querySelector('#paint-canvas').getBoundingClientRect();
    return Math.abs(img.left - c.left) < 1 && Math.abs(img.top - c.top) < 1 &&
      Math.abs(img.width - c.width) < 1 && Math.abs(img.height - c.height) < 1;
  });
  check('canvas stays aligned with figure on resize', aligned);

  check('no console errors', errors.length === 0, errors.join(' | '));

  await browser.close();
  const failed = results.filter(r => !r.pass);
  console.log('\n==== ' + (results.length - failed.length) + '/' + results.length + ' passed ====');
  if (failed.length) { console.log('FAILURES:', JSON.stringify(failed, null, 1)); process.exit(1); }
})();
