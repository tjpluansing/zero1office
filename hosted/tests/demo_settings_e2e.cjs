// Settings > Demo mode before supabase-demo.sql is run (NOFN=1) and after: ticks save, survive a reload,
// and a signed-in person opening DEMO gets the ticked pages. Same setup as e2e.cjs.
const { chromium } = require('playwright');
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', m); };
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.goto('http://localhost:8765/config.js');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('ak-view-mode', 'live'); });
  if (process.env.NOFN) await p.addInitScript(() => { window.__noDemoFn = true; });
  await p.goto('http://localhost:8765/index.html');
  await p.waitForSelector('#z1hForm'); await p.fill('#z1hE', 'paolo@ask-karla.com'); await p.fill('#z1hP', 'paolo-pass-123');
  await p.click('#z1hGo');
  await p.waitForFunction(() => window.Z1Auth && Z1Auth.me && Z1Auth.me(), null, { timeout: 30000 }); await p.waitForTimeout(1500);
  await p.click('#nav [data-go="settings"]'); await p.waitForTimeout(500);
  await p.click('#z1demoCard [data-z1pg="clients"]'); await p.waitForTimeout(300);
  await p.click('#z1demoCard [data-z1demo="save"]'); await p.waitForTimeout(800);
  ok(await p.evaluate(() => !document.querySelector('[data-z1pg="clients"]').checked && !__fakeState.docs['meta/demo'].pages.includes('clients')), 'untick saves');
  await p.reload(); await p.waitForFunction(() => window.Z1Auth && Z1Auth.me && Z1Auth.me(), null, { timeout: 30000 }); await p.waitForTimeout(1500);
  await p.click('#nav [data-go="settings"]'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => !document.querySelector('[data-z1pg="clients"]').checked), 'still unticked after reload');
  await p.click('#z1mode [data-z1mode="demo"]');
  await p.waitForFunction(() => window.Z1Host && Z1Host.demo && window.S && S.data, null, { timeout: 15000 }); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => !document.querySelector('#side [data-go="clients"]') && !!document.querySelector('#side [data-go="office"]')), 'demo opened by a signed-in person hides the unticked page');
  await b.close();
  if (fails) process.exit(1);
})();
