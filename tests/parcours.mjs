// Parcours de bout en bout de /le-mur/ (Chromium headless via playwright-core).
// Lancer : node tests/parcours.mjs   (CHROME=/chemin/chrome pour un autre navigateur)
// Sert public/ en local, joue le parcours en accéléré (?speed ?dur) et mesure CPU / mémoire.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.pdf': 'application/pdf' };
const srv = http.createServer((q, r) => {
  let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${srv.address().port}`;

const chrome = process.env.CHROME || (() => {
  const d = path.join(os.homedir(), '.cache/ms-playwright');
  const c = fs.existsSync(d) ? fs.readdirSync(d).filter(x => x.startsWith('chromium-')).sort().pop() : null;
  return c ? path.join(d, c, 'chrome-linux64/chrome') : undefined;
})();
const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 650 }, hasTouch: false });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error' && !/cloudflare|ERR_/i.test(m.text())) errs.push(m.text()); });
await page.route(/cloudflareinsights/, r => r.abort());

let ok = 0, ko = 0;
const check = (cond, msg) => { if (cond) { ok++; console.log('  ok   ' + msg); } else { ko++; console.log('  FAIL ' + msg); } };
const act = () => page.evaluate(() => window.__piece.act);
const waitAct = (n, ms = 30000) => page.waitForFunction(n => window.__piece.act === n, n, { timeout: ms });
const ACT = { MUR: 2, PAUSE: 3, GESTE: 4, POSE: 5, FIN: 6 };

try {
  await page.goto(`${base}/le-mur/?seed=7&speed=4&dur=0.5`);
  await page.waitForSelector('#card.vis');
  check(!(await page.textContent('#box')).match(/dessin/i), 'prologue : aucune consigne « dessiner »');

  for (let i = 0; i < 5; i++) { await page.click('[data-a=next]'); await page.waitForTimeout(80); }
  await page.click('[data-a=start]');
  await page.waitForSelector('#sq'); check(true, 'écran des couleurs');
  const sq = await page.locator('#sq').boundingBox();
  await page.mouse.click(sq.x + sq.width / 2, sq.y + 2);            // un bord : deux couleurs
  check(/ et /.test(await page.textContent('#sqTxt')) && !/quatre/.test(await page.textContent('#sqTxt')), 'palette : deux couleurs au plus');
  await page.click('[data-a=amb-ok]'); await page.click('[data-a=enter]');
  await waitAct(ACT.MUR); await page.waitForTimeout(800); check(true, 'phase mur');

  for (const [x, y] of [[200, 200], [450, 300], [650, 420]]) { await page.mouse.click(x, y); await page.waitForTimeout(120); }
  check((await page.evaluate(() => window.__piece.marks)) === 3, '3 repères posés');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#go')).display !== 'none');
  await page.click('#go'); await waitAct(ACT.PAUSE); check(true, 'Continuer : mur -> pause');

  await page.waitForSelector('#go:visible', { timeout: 30000 });
  await page.click('#go'); await page.waitForSelector('[data-a=voice-no]'); await page.click('[data-a=voice-no]');
  await waitAct(ACT.GESTE); await page.waitForTimeout(800); check(true, 'pause -> choix voix/doigt -> geste');
  check(!/dessin/i.test(await page.textContent('#hint')), 'geste : consigne sans « dessiner »');

  // geste : un trait, puis doigt posé > 3 s simulées -> nouveau trait
  const heap0 = await page.evaluate(() => performance.memory.usedJSHeapSize);
  const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable');
  const m0 = (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'TaskDuration').value; const t0 = Date.now();
  await page.mouse.move(150, 150); await page.mouse.down();
  for (let i = 0; i < 40; i++) { await page.mouse.move(150 + i * 12, 150 + 90 * Math.sin(i / 5)); await page.waitForTimeout(20); }
  const s1 = await page.evaluate(() => window.__piece.strokes());
  await page.waitForTimeout(1600);                                   // ~4,8 s simulées immobile (speed=4)
  const s2 = await page.evaluate(() => window.__piece.strokes());
  check(s1 === 1 && s2 >= 2, `doigt posé : nouveau trait (${s1} -> ${s2})`);
  await page.mouse.up();
  for (let k = 0; k < 3; k++) { await page.mouse.move(300, 300); await page.mouse.down();
    for (let i = 0; i < 30; i++) { await page.mouse.move(300 + i * 8, 300 + (i % 2) * 40); await page.waitForTimeout(20); } await page.mouse.up(); }
  check((await page.evaluate(() => window.__piece.cover())) > 0.005, 'de la couleur est apparue sur le mur');

  await page.click('#more'); check(true, 'Plus de temps cliquable'); // +60 s * dur
  // mesures CPU / mémoire (non-régression grossière)
  const m1 = (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'TaskDuration').value;
  const cpu = (m1 - m0) / ((Date.now() - t0) / 1000);
  const heap1 = await page.evaluate(() => performance.memory.usedJSHeapSize);
  console.log(`  info CPU ~ ${(cpu * 100).toFixed(0)} % d'un coeur (speed=4), tas JS ${(heap0 / 1e6).toFixed(1)} -> ${(heap1 / 1e6).toFixed(1)} Mo`);
  check(cpu < 2.5, 'CPU : sous 2,5 coeurs en geste accéléré x4');
  check(heap1 - heap0 < 60e6, 'mémoire : le tas JS croît de moins de 60 Mo pendant le geste');

  await page.click('#skip'); await waitAct(ACT.POSE); await page.click('#skip'); await waitAct(ACT.FIN);
  check(true, 'Continuer : geste -> pose -> fin');
  await page.waitForSelector('[data-a=vanish]'); check(/dessin/i.test(await page.textContent('#box')) === false, 'carte finale : sans « dessiné »');
  await page.click('[data-a=vanish]');
  await page.waitForSelector('#pcLink', { timeout: 20000 });
  check((await page.getAttribute('#pcLink', 'href')) === 'https://www.peacefulcode.com/', 'écran final : lien Peaceful Code');
  check(errs.length === 0, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
} catch (e) { ko++; console.log('  FAIL exception : ' + e.message); }
await browser.close(); srv.close();
console.log(`${ok} ok, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
