// End-to-end check of the hosted build against tests/fake-supabase.js.
// Build to a folder, replace its supabase.js with tests/fake-supabase.js, set config.js to
// window.Z1_CONFIG={url:"http://localhost:8765/fake",anonKey:"anon"}, serve it on port 8765, then: node hosted/tests/e2e.cjs
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('dialog', d => { console.log('DIALOG', d.type(), d.message()); d.accept(); }); p.on('framenavigated', f => { if (f === p.mainFrame()) console.log('NAV'); });
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  const ok = (c, s) => console.log(c ? 'PASS' : 'FAIL', s);
  const login = async (em, pw) => {
    await p.waitForSelector('#z1hForm', { timeout: 15000 });
    await p.fill('#z1hE', em); await p.fill('#z1hP', pw);
    await p.evaluate(() => document.getElementById('z1hForm').requestSubmit());
    await p.waitForFunction((e) => window.Z1Auth && window.Z1Auth.me && window.Z1Auth.me() && window.Z1Auth.me().email === e, em, { timeout: 30000 });
    await p.waitForTimeout(1200);
  };
  const click = (sel) => p.evaluate((s) => { const el = document.querySelector(s); if (!el) throw new Error('no ' + s); el.click(); }, sel);
  await p.goto('http://localhost:8765/index.html');
  await p.evaluate(() => localStorage.clear()); await p.reload();
  // visitors land on the demo; LIVE opens the sign-in
  await p.waitForSelector('#z1mode [data-z1mode="live"]', { timeout: 15000 }); await click('#z1mode [data-z1mode="live"]');
  await login('paolo@ask-karla.com', 'paolo-pass-123');
  ok(await p.evaluate(() => !!window.__fakeState.docs['z1users/paolo_ask_karla_com'].lastLogin), 'lastLogin recorded for hosted sign-in');
  // add staff
  await click('[data-go="users"]'); await p.waitForTimeout(500);
  await click('[data-zu="add"], [data-zx="add"]').catch(async () => { await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /Add user/.test(x.textContent)).click()); });
  await p.waitForSelector('#zx-email');
  await p.fill('#zx-name', 'Ana Staff'); await p.fill('#zx-email', 'ana@ask-karla.com'); await p.fill('#zx-title', 'Secretary');
  await p.evaluate(() => { document.querySelectorAll('#zx-pages input[data-pg]').forEach(c => c.checked = false); ['today','hr'].forEach(k => { const c = document.querySelector('#zx-pages input[data-pg="' + k + '"]'); if (c) c.checked = true; }); });
  const ticked = await p.evaluate(() => [...document.querySelectorAll('#zx-pages input[data-pg]:checked')].map(c => c.getAttribute('data-pg')));
  console.log('ticked', ticked, 'all keys', await p.evaluate(() => [...document.querySelectorAll('#zx-pages input[data-pg]')].map(c => c.getAttribute('data-pg')).slice(0, 8)));
  await p.evaluate(() => document.querySelector('form[data-form="z1user"]').requestSubmit());
  await p.waitForTimeout(1200);
  const temp = await p.evaluate(() => window.__lastTemp);
  const shown = await p.evaluate(() => document.body.innerText.includes(window.__lastTemp || 'zzz'));
  ok(!!temp && shown, 'temp password made by server function and shown once: ' + temp);
  ok(await p.evaluate(() => { const d = window.__fakeState.docs['z1users/ana_ask_karla_com']; return d && d.mustChange && !d.pw; }), 'staff record saved with mustChange, no password stored');
  await p.screenshot({ path: '/tmp/h2-added.png' });
  // company profile
  await click('[data-go="company"]'); await p.waitForTimeout(500);
  await p.fill('#zc-name', 'Ask Karla Insurance Agency');
  await p.evaluate(() => document.querySelector('form[data-form="z1co"]').requestSubmit());
  await p.waitForTimeout(800);
  ok(await p.evaluate(() => (window.__fakeState.docs['meta/company'] || {}).name === 'Ask Karla Insurance Agency'), 'company profile saved to the database');
  // remote change from another person
  await p.evaluate(() => window.__fakeRemote('meta/company', Object.assign({}, window.__fakeState.docs['meta/company'], { name: 'Ask Karla (remote edit)' })));
  await p.waitForTimeout(800);
  ok(await p.evaluate(() => document.querySelector('#side').innerText.includes('remote edit')), 'another person\'s change appears live in the menu');
  // sign out
  await p.evaluate(() => { document.querySelector('[data-z1="signout"]').click(); });
  await p.waitForSelector('#z1hForm', { timeout: 10000 }).then(() => ok(true, 'sign out returns to the sign-in screen'), (e) => ok(false, 'sign out: ' + e.message.slice(0,200)));
  // staff
  await login('ana@ask-karla.com', temp);
  const view = await p.evaluate(() => document.body.innerText.includes('Change password'));
  ok(view, 'staff lands on profile with change password');
  await p.screenshot({ path: '/tmp/h2-staff.png' });
  await p.fill('#zu-old', temp); await p.fill('#zu-new', 'ana-new-pass-1'); await p.fill('#zu-new2', 'ana-new-pass-1');
  await p.evaluate(() => document.querySelector('form[data-form="z1pw"]').requestSubmit());
  await p.waitForTimeout(1000);
  ok(await p.evaluate(() => window.__fakeState.users['ana@ask-karla.com'] === 'ana-new-pass-1' && !window.__fakeState.docs['z1users/ana_ask_karla_com'].mustChange), 'password changed on the server and flag cleared');
  const nav = await p.evaluate(() => [...document.querySelectorAll('#side [data-go]')].map(a => a.getAttribute('data-go')));
  console.log('staff nav', nav);
  ok(!nav.includes('users') && !nav.includes('billing'), 'staff menu limited to ticked pages');
  await p.evaluate(() => { S.view = 'billing'; render(); }).catch(e => console.log('render err', e.message));
  await p.waitForTimeout(400);
  console.log('after forcing billing, view =', await p.evaluate(() => S.view));
  // reload keeps session
  await p.reload(); await p.waitForFunction(() => window.Z1Auth && window.Z1Auth.me && window.Z1Auth.me(), null, { timeout: 30000 });
  ok(await p.evaluate(() => window.Z1Auth.me().email === 'ana@ask-karla.com'), 'reload keeps the staff signed in');
  console.log('ERRORS', errs);
  await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
