// Numbers > Proposals shows what the Proposal generator made (proplog.js). Same setup as e2e.cjs, then:
// node hosted/tests/proposals_log_e2e.cjs
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errs = []; let fails = 0;
  p.on('pageerror', e => errs.push(e.stack.split('\n').slice(0,3).join(' | ')));
  const ok = (c, s) => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', s); };
  const tile = () => p.evaluate(() => { S.view = 'proposals'; render(); const k = [...document.querySelectorAll('.tile')].find(t => /Open proposals/.test(t.textContent)); return k ? k.querySelector('.v').textContent : 'none'; });
  await p.goto('http://localhost:8765/index.html');
  await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.waitForFunction(() => window.Z1Host && window.Z1Host.demo && window.S && window.Z1PropLog, null, { timeout: 20000 });
  ok(+(await tile()) > 0, 'demo keeps its sample proposals');
  await p.evaluate(() => document.querySelector('#z1mode [data-z1mode="live"]').click());
  await p.waitForSelector('#z1hForm', { timeout: 15000 });
  await p.fill('#z1hE', 'paolo@ask-karla.com'); await p.fill('#z1hP', 'paolo-pass-123');
  await p.evaluate(() => document.getElementById('z1hForm').requestSubmit());
  await p.waitForFunction(() => window.Z1Auth && window.Z1Auth.me && window.Z1Auth.me() && window.Z1PropLog, null, { timeout: 30000 });
  await p.waitForTimeout(2000);
  ok(await tile() === '0', 'live starts at 0 open proposals');
  // what propgen.js passes when a proposal passes Maya's check
  await p.evaluate(() => {
    const o = { kind: 'mxf', co: 'Maxicare', type: 'Family', fam: true, subject: 'MyMaxicare proposal', total: [[31000, 42000], [16000, 22000]], c: { name: 'Test Client', people: [{}, {}, {}] } };
    const a = { id: 'pg_test1', kind: 'Proposal', title: 't', who: 'maya', state: 'waiting' };
    S.data.approvals = S.data.approvals || []; S.data.approvals.unshift(a);
    return Z1PropLog.add(o, a);
  });
  await p.waitForTimeout(800);
  ok(await tile() === '1', 'a checked proposal shows as 1 open proposal');
  const row = await p.evaluate(() => PROPOSALS[0]);
  ok(row.n === 'Test Client' && row.m === 3 && row.prem === 31000 && row.stage === 'Waiting for you' && row.prod === 'HMO', 'row has name, 3 lives, lowest yearly premium, stage ' + JSON.stringify(row));
  ok(await p.evaluate(() => (window.__fakeState.docs['meta/proposals'] || {}).list.length === 1), 'saved to the shared database (meta/proposals)');
  ok(await p.evaluate(() => !JSON.stringify(window.__fakeState.docs['meta/proposals']).includes('@')), 'no email saved');
  // regenerating the same proposal replaces it instead of adding a second
  await p.evaluate(() => { const o = { kind: 'mxf', co: 'Maxicare', type: 'Family', fam: true, total: [[30000]], c: { name: 'Test Client', people: [{}, {}] } }; const a = { id: 'pg_test2', kind: 'Proposal', title: 't', who: 'maya', state: 'waiting' }; S.data.approvals.unshift(a); return Z1PropLog.add(o, a); });
  await p.waitForTimeout(500);
  ok(await tile() === '1', 'a regenerated proposal replaces the old one');
  // approval moves the stage, the draft marks it sent
  await p.evaluate(() => { S.data.approvals.find(x => x.id === 'pg_test2').state = 'approved'; });
  await p.waitForTimeout(3000);
  ok(await p.evaluate(() => PROPOSALS[0].stage) === 'Drafting', 'approved shows as Drafting');
  await p.evaluate(() => Z1PropLog.stage('pg_test2', 'Sent')); await p.waitForTimeout(500);
  ok(await p.evaluate(() => PROPOSALS[0].stage) === 'Sent' && await tile() === '1', 'draft made shows as Sent, still open until won or lost');
  // survives a reload
  await p.reload();
  await p.waitForFunction(() => window.Z1Auth && window.Z1Auth.me && window.Z1Auth.me() && window.Z1PropLog, null, { timeout: 30000 });
  await p.waitForTimeout(2500);
  ok(await tile() === '1', 'still there after a reload');
  const txt = await p.evaluate(() => document.querySelector('#content').innerText);
  ok(/Test Client/.test(txt), 'listed on the Proposals page');
  console.log('ERRORS', errs);
  await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
