// LIVE shows no sample records; the DEMO keeps them. Same setup as e2e.cjs (fake Supabase on port 8765), then:
// node hosted/tests/live_nosample_e2e.cjs
const { chromium } = require('playwright');
const SAMPLE = /Northpoint|Brightpath|Seaside|Quezon City|25-person clinic|212 new SMEs/i;
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errs = []; let fails = 0;
  p.on('pageerror', e => errs.push(e.message));
  const ok = (c, s) => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', s); };
  const office = async () => { await p.evaluate(() => { S.view = 'office'; render(); }); await p.waitForTimeout(5000); return p.frames().find(f => f !== p.mainFrame()); };
  const officeText = (fr) => fr.evaluate(() => [VIEWS.home(), vInbox(), vReport(), JSON.stringify(DATA), JSON.stringify(S.inbox), HUMAN_LINES.join(' '), JSON.stringify(CHAT)].concat(A.map(a => vAgent(a.id))).join(' '));
  await p.goto('http://localhost:8765/index.html');
  await p.evaluate(() => localStorage.clear()); await p.reload();
  // DEMO keeps the samples
  await p.waitForSelector('#z1mode [data-z1mode="live"]', { timeout: 20000 });
  await p.waitForFunction(() => window.Z1Host && window.Z1Host.demo && window.S, null, { timeout: 20000 });
  let fr = await office();
  ok(fr && await fr.evaluate(() => DATA.ap.length === 4 && S.inbox.length === 3), 'demo office keeps its sample approvals and inbox');
  // a live browser that saved the old sample inbox before this fix
  await p.evaluate(() => { const ls = Object.getPrototypeOf(localStorage); window.__nativeSet.call(localStorage, 'zero1office-floor:v1', JSON.stringify({ inbox: [{ id: 's1', title: 'Northpoint Logistics: 3-tier HMO proposal', from: 'maya', at: '8:42 AM' }], apDone: {}, duty: {} })); });
  await p.evaluate(() => document.querySelector('#z1mode [data-z1mode="live"]').click());
  await p.waitForSelector('#z1hForm', { timeout: 15000 });
  await p.fill('#z1hE', 'paolo@ask-karla.com'); await p.fill('#z1hP', 'paolo-pass-123');
  await p.evaluate(() => document.getElementById('z1hForm').requestSubmit());
  await p.waitForFunction(() => window.Z1Auth && window.Z1Auth.me && window.Z1Auth.me(), null, { timeout: 30000 });
  await p.waitForTimeout(3000);
  // every app page
  const views = await p.evaluate(() => Object.keys(VIEWS));
  const hits = [];
  for (const v of views) { await p.evaluate((v) => { S.view = v; render(); }, v); await p.waitForTimeout(150); const t = await p.evaluate(() => document.body.innerText); if (SAMPLE.test(t)) hits.push(v + ': ' + t.match(SAMPLE)[0]); }
  ok(!hits.length, 'no sample names on any of ' + views.length + ' live pages ' + hits.join('; '));
  fr = await office();
  ok(fr && await fr.evaluate(() => DATA.ap.length === 0 && aps().length === 0), 'live office has no sample approvals');
  ok(fr && await fr.evaluate(() => S.inbox.length === 0), 'live office inbox starts empty, even after the old sample was saved');
  ok(fr && await fr.evaluate(() => !VIEWS.home().includes('Do this next')), 'Today in your office shows no sample "Do this next"');
  const t = fr ? await officeText(fr) : 'no frame';
  ok(!SAMPLE.test(t), 'no sample names anywhere in the live office ' + ((t.match(SAMPLE) || [])[0] || ''));
  ok(fr && await fr.evaluate(() => A.every(a => !a.e.human && !a.e.staff ? a.done === 0 : true)), 'live scoreboard starts at zero');
  // agents don't pretend to finish work in LIVE
  ok(fr && await fr.evaluate(() => { const a = A.find(x => x.id === 'maya'); const n = S.inbox.length; finishTask(a); return a.done === 0 && S.inbox.length === n; }), 'agents do not fake finished work in live');
  console.log('ERRORS', errs);
  await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
