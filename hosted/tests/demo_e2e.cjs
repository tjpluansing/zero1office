// DEMO | LIVE check of the hosted build. Same setup as e2e.cjs (fake Supabase on port 8765), then: node hosted/tests/demo_e2e.cjs
// Proves: visitors land on the demo with sample data; the demo never touches the database or what this browser saved
// while signed in; LIVE opens sign-in; Settings > Demo mode turns the demo off and picks its pages.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  let fails = 0;
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  const ok = (c, s) => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', s); };
  const click = (sel) => p.evaluate((s) => { const el = document.querySelector(s); if (!el) throw new Error('no ' + s); el.click(); }, sel);
  const go = async (v) => { await p.evaluate((v) => { S.view = v; render(); }, v); await p.waitForTimeout(300); };
  const text = () => p.evaluate(() => document.body.innerText);
  const SECRET = 'REAL-CLIENT-SECRET';

  await p.goto('http://localhost:8765/config.js'); // same site, without the app, so this writes real browser storage
  // this browser was used live before: a real record is saved in it
  await p.evaluate((sec) => {
    localStorage.clear();
    localStorage.setItem('zero1office-mock:v3', JSON.stringify({ data: { todos: [{ id: 'r1', x: sec, p: 'urgent', done: false }] } }));
    localStorage.setItem('zero1office-billing:v1', JSON.stringify({ soas: [{ id: 'r2', soa_no: sec, provider: 'Maxicare', account_name: sec, amount: 1, stage: 'draft' }], events: [], payouts: [], noDummy: true }));
  }, SECRET);
  await p.goto('http://localhost:8765/index.html');
  await p.waitForSelector('#z1mode', { timeout: 15000 });
  await p.waitForTimeout(1500);
  ok(await p.evaluate(() => Z1Host.demo && document.querySelector('#z1mode [data-z1mode="demo"]').getAttribute('aria-pressed') === 'true'), 'visitor lands on the demo with DEMO pressed');
  ok((await text()).includes('Sample activity. No real data.'), 'demo says "Sample activity. No real data."');
  ok(await p.evaluate(() => (window.__fromCalls || 0) === 0), 'demo made no database calls');
  await go('todo');
  let t = await text();
  ok(!t.includes(SECRET) && t.includes('Approve the Northpoint proposal'), 'to do list shows sample tasks, not the saved real one');
  await go('approvals'); ok((await text()).includes('Northpoint Logistics'), 'approvals show sample proposals');
  await go('clients'); ok((await text()).includes('Brightpath'), 'client stats show sample clients');
  await go('billing'); t = await text();
  ok(!t.includes(SECRET) && t.includes('MX-SAMPLE-0412'), 'billing shows sample SOAs, not the saved real one');
  await go('office'); await p.waitForTimeout(2500);
  const fr = p.frames().find(f => f !== p.mainFrame());
  if (fr) {
    ok(await fr.evaluate((sec) => { const v = localStorage.getItem('zero1office-billing:v1') || ''; return !v.includes(sec); }, SECRET), 'the 3D office frame reads demo storage too');
  } else ok(false, 'office frame found');
  await p.screenshot({ path: '/tmp/demo-office.png' });
  // writing in the demo leaves the real saved data alone
  await go('todo');
  await p.fill('#todoText', 'demo-only task'); await p.evaluate(() => document.querySelector('form[data-form="todo"]').requestSubmit());
  await p.waitForTimeout(300);
  ok((await text()).includes('demo-only task'), 'demo visitors can try things');
  await go('settings'); ok((await text()).includes('You are looking at the demo'), 'Settings in the demo explains how to change it');
  await go('users'); ok(await p.evaluate(() => S.view !== 'users'), 'Users page is not in the demo');
  ok(await p.evaluate(() => (window.__fromCalls || 0) === 0), 'still no database calls after using the demo');
  // phone width: switch still fits
  await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(300);
  ok(await p.evaluate(() => { const r = document.querySelector('#z1mode').getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth; }), 'switch shows on a phone');
  await p.screenshot({ path: '/tmp/demo-phone.png' });
  await p.setViewportSize({ width: 1280, height: 900 });

  // LIVE -> sign-in
  await click('#z1mode [data-z1mode="live"]');
  await p.waitForSelector('#z1hForm', { timeout: 15000 });
  ok(await p.evaluate(() => !!document.querySelector('#z1h [data-z1mode="demo"]')), 'sign-in screen offers DEMO');
  ok(await p.evaluate((sec) => localStorage.getItem('zero1office-mock:v3').includes(sec) && !localStorage.getItem('zero1office-mock:v3').includes('demo-only task'), SECRET), 'real saved data untouched by the demo');
  await p.screenshot({ path: '/tmp/demo-login.png' });
  await p.fill('#z1hE', 'paolo@ask-karla.com'); await p.fill('#z1hP', 'paolo-pass-123');
  await p.evaluate(() => document.getElementById('z1hForm').requestSubmit());
  await p.waitForFunction(() => window.Z1Auth && Z1Auth.me && Z1Auth.me(), null, { timeout: 30000 }); await p.waitForTimeout(1200);
  ok(await p.evaluate(() => !Z1Host.demo && document.querySelector('#z1mode [data-z1mode="live"]').getAttribute('aria-pressed') === 'true'), 'signed in: LIVE pressed');
  await go('todo'); ok((await text()).includes(SECRET), 'live shows the real record');

  // Settings > Demo mode
  await go('settings');
  ok(await p.evaluate(() => !!document.getElementById('z1demoCard')), 'Super Admin sees Demo mode in Settings');
  await p.screenshot({ path: '/tmp/demo-settings.png', fullPage: false });
  await p.evaluate(() => { const c = document.querySelector('[data-z1pg="clients"]'); c.click(); });
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => !(__fakeState.docs['meta/demo'] || {}).pages && document.body.innerText.includes('Not saved yet')), 'a tick waits for Save pages');
  await click('[data-z1demo="save"]'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => { const d = __fakeState.docs['meta/demo']; return d && Array.isArray(d.pages) && !d.pages.includes('clients') && d.pages.includes('office'); }), 'unticking a page saves the demo page list');
  // reload while signed in stays live
  await p.reload(); await p.waitForFunction(() => window.Z1Auth && Z1Auth.me && Z1Auth.me(), null, { timeout: 30000 }); await p.waitForTimeout(800);
  ok(await p.evaluate(() => !Z1Host.demo), 'reload while signed in stays live');
  // DEMO from live: page list applies
  await click('#z1mode [data-z1mode="demo"]');
  await p.waitForFunction(() => window.Z1Host && Z1Host.demo && window.S && S.data, null, { timeout: 15000 }); await p.waitForTimeout(1500);
  const nav = await p.evaluate(() => [...document.querySelectorAll('#side [data-go]')].map(a => a.getAttribute('data-go')));
  ok(!nav.includes('clients') && nav.includes('office'), 'demo menu follows the ticked pages: ' + nav.join(','));
  ok(await p.evaluate(() => (window.__fromCalls || 0) === 0), 'demo opened from live makes no database calls');
  // sign out in the demo = go to sign-in
  await p.evaluate(() => { const b = document.querySelector('[data-z1="signout"]'); if (b) b.click(); else document.querySelector('#z1mode [data-z1mode="live"]').click(); });
  await p.waitForFunction(() => window.Z1Auth && Z1Auth.me && Z1Auth.me() && !Z1Host.demo, null, { timeout: 30000 }).catch(() => {});
  ok(await p.evaluate(() => !Z1Host.demo), 'LIVE from the demo goes back to the live app (still signed in)');
  // turn the demo off
  await go('settings');
  await click('[data-z1demo="on"]'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => __fakeState.docs['meta/demo'].on === false && !document.getElementById('z1mode')), 'demo can be turned off; the switch disappears');
  await p.evaluate(() => document.querySelector('[data-z1="signout"]').click());
  await p.waitForSelector('#z1hForm', { timeout: 15000 });
  ok(await p.evaluate(() => !document.querySelector('#z1h [data-z1mode]')), 'with the demo off, sign-in has no DEMO button');
  await p.evaluate(() => localStorage.removeItem('ak-view-mode')); await p.reload(); await p.waitForSelector('#z1hForm', { timeout: 15000 });
  ok(await p.evaluate(() => !Z1Host.demo), 'with the demo off, visitors go straight to sign-in');

  console.log('ERRORS', errs);
  await b.close();
  if (fails) { console.log(fails + ' FAILED'); process.exit(1); }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
