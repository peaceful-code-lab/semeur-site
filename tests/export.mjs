// Export HD de /le-mur/ : télécharge réellement A4 et A3, vérifie dimensions, contenu, netteté, repli mobile.
// Lancer : node tests/export.mjs   (CHROME=/chemin/chrome pour un autre navigateur). Chromium headless seulement.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.pdf': 'application/pdf', '.png': 'image/png' };
let extra = null;   // fichier injecté (PNG téléchargé) servi sur /__x.png
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/__x.png') && extra) { r.writeHead(200, { 'content-type': 'image/png' }); return r.end(extra); }
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
const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox'] });
let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log('  ok   ' + m); } else { ko++; console.log('  FAIL ' + m); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mur-export-'));
const rss = () => { try { return +execSync(`ps -eo rss,args | grep -F "${chrome}" | grep -v grep | awk '{s+=$1} END{print s}'`).toString() / 1024; } catch { return NaN; } };

async function toFin(page, q = '') {
  await page.goto(`${base}/le-mur/?seed=7&speed=4&dur=0.5${q}`);
  await page.waitForSelector('#card.vis');
  for (let i = 0; i < 5; i++) { await page.click('[data-a=next]'); await page.waitForTimeout(80); }
  await page.click('[data-a=start]'); await page.waitForSelector('#sq');
  await page.click('[data-a=amb-ok]'); await page.click('[data-a=enter]');
  await page.waitForFunction(() => window.__piece.act === 2); await page.waitForTimeout(500);
  const vp = page.viewportSize();
  for (const [x, y] of [[.3, .3], [.6, .5], [.5, .75]]) { await page.mouse.click(vp.width * x, vp.height * y); await page.waitForTimeout(100); }
  await page.click('#skip'); await page.waitForFunction(() => window.__piece.act === 3);
  await page.click('#skip'); await page.waitForSelector('[data-a=voice-no]'); await page.click('[data-a=voice-no]');
  await page.waitForFunction(() => window.__piece.act === 4);
  for (let k = 0; k < 4; k++) { await page.mouse.move(vp.width * .2, vp.height * (.25 + k * .15)); await page.mouse.down();
    for (let i = 0; i < 30; i++) { await page.mouse.move(vp.width * (.2 + i * .02), vp.height * (.25 + k * .15) + 40 * Math.sin(i / 3)); await page.waitForTimeout(25); } await page.mouse.up(); }
  await page.waitForTimeout(1500);
  await page.click('#skip'); await page.waitForFunction(() => window.__piece.act === 5);
  await page.click('#skip'); await page.waitForFunction(() => window.__piece.act === 6);
  await page.waitForSelector('[data-a=hd-A3]');
}
const pngSize = f => { const b = fs.readFileSync(f); return { sig: b.slice(1, 4).toString() === 'PNG', w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length }; };
async function download(page, fmt) {
  const t0 = Date.now(), dl = page.waitForEvent('download', { timeout: 180000 });
  await page.click(`[data-a=hd-${fmt}]`);
  const d = await dl, f = path.join(tmp, `${fmt}.png`); await d.saveAs(f);
  return { f, ms: Date.now() - t0, name: d.suggestedFilename() };
}

try {
  // ───── ordinateur, portrait : A4 et A3 réels
  const ctx = await browser.newContext({ viewport: { width: 600, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/cloudflare|ERR_/i.test(m.text())) errs.push(m.text()); });
  await page.route(/cloudflareinsights/, r => r.abort());
  await toFin(page); check(true, 'écran final atteint, boutons « Télécharger A4 / A3 » présents');
  check((await page.textContent('[data-a=hd-A4]')) === 'Télécharger A4' && (await page.textContent('[data-a=hd-A3]')) === 'Télécharger A3', 'libellés des boutons');

  // le petit format gratuit reste inchangé : 2×W, 2×H
  const small = await page.evaluate(() => new Promise(r => { const i = new Image(); i.onload = () => r([i.width, i.height]); i.src = window.__lab.png(); }));
  const [W, H] = await page.evaluate(() => [window.__piece.W, window.__piece.H]);
  check(small[0] === W && small[1] === H, `petit format (écran, ${W}×${H}) inchangé`);
  const dsave = page.waitForEvent('download'); await page.click('[data-a=save]'); const ds = await dsave; await ds.saveAs(path.join(tmp, 'small.png'));
  const sm = pngSize(path.join(tmp, 'small.png')); check(sm.w === 2 * W && sm.h === 2 * H, `« Garder l'image » inchangé : ${sm.w}×${sm.h}`);

  const r0 = rss();
  const a4 = await download(page, 'A4'); const s4 = pngSize(a4.f);
  check(s4.sig && s4.w === 2480 && s4.h === 3508, `A4 : ${s4.w}×${s4.h} (${(s4.bytes / 1e6).toFixed(1)} Mo, ${(a4.ms / 1000).toFixed(1)} s)`);
  const a3 = await download(page, 'A3'); const s3 = pngSize(a3.f);
  check(s3.sig && s3.w === 3508 && s3.h === 4961, `A3 : ${s3.w}×${s3.h} (${(s3.bytes / 1e6).toFixed(1)} Mo, ${(a3.ms / 1000).toFixed(1)} s)`);
  check(/-A3\.png$/.test(a3.name), 'nom de fichier ' + a3.name);
  const r1 = rss(); console.log(`  info mémoire du navigateur (RSS, tous processus) : ${r0.toFixed(0)} -> ${r1.toFixed(0)} Mo après A4+A3`);

  // contenu et netteté : l'A3 téléchargé contre un simple agrandissement de l'image à l'écran
  extra = fs.readFileSync(a3.f);
  const view = await ctx.newPage();
  await view.goto(`${base}/le-mur/?seed=7`); await view.route(/cloudflareinsights/, r => r.abort());
  const screenPng = await page.evaluate(() => window.__lab.png());
  const m = await view.evaluate(async ([url, scr, W, H]) => {
    const load = s => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = s; });
    const big = await load(url), sm = await load(scr);
    // zone du tableau dans la page A3 : on la retrouve avec la même formule que l'appli (Moteur est chargé dans la page)
    const L = Moteur.exportLayout('A3', W, H);
    const crop = (src, sx, sy, sw, sh, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.drawImage(src, sx, sy, sw, sh, 0, 0, w, h); return x.getImageData(0, 0, w, h); };
    const N = 1000, cx = L.x + (L.iw - N) / 2 | 0, cy = L.y + (L.ih - N) / 2 | 0;
    const A = crop(big, cx, cy, N, N, N, N);                                   // export HD, zone centrale
    const sx = (cx - L.x) / L.scale, sy = (cy - L.y) / L.scale, sw = N / L.scale;
    const B = crop(sm, sx, sy, sw, sw, N, N);                                  // agrandissement lissé de l'écran
    const lum = d => { const o = new Float32Array(N * N); for (let i = 0; i < N * N; i++) o[i] = .3 * d.data[i * 4] + .59 * d.data[i * 4 + 1] + .11 * d.data[i * 4 + 2]; return o; };
    // netteté = énergie de gradient sur un pas de 6 px (insensible au grain de 1 px), + p99 du gradient
    const sharp = l => { const g = []; for (let y = 0; y < N - 6; y += 2) for (let x = 0; x < N - 6; x += 2) g.push(Math.hypot(l[y * N + x + 6] - l[y * N + x], l[(y + 6) * N + x] - l[y * N + x])); g.sort((a, b) => a - b); return { mean: g.reduce((a, b) => a + b, 0) / g.length, p99: g[Math.floor(g.length * .99)] }; };
    const la = lum(A), lb = lum(B);
    // non vide : écart-type de luminosité et part de pixels non « mur nu »
    const mean = la.reduce((a, b) => a + b, 0) / la.length, sd = Math.sqrt(la.reduce((a, b) => a + (b - mean) ** 2, 0) / la.length);
    // page entière : pas de blanc/noir pur uniforme
    const full = crop(big, 0, 0, big.width, big.height, 200, 280); let blank = 0; for (let i = 0; i < full.data.length; i += 4) if (full.data[i] === full.data[0] && full.data[i + 1] === full.data[1] && full.data[i + 2] === full.data[2]) blank++;
    return { sd, mean, hd: sharp(la), up: sharp(lb), blankRatio: blank / (full.data.length / 4), dims: [big.width, big.height] };
  }, [`${base}/__x.png`, screenPng, W, H]);
  console.log(`  info netteté (gradient moyen / p99) : HD ${m.hd.mean.toFixed(2)} / ${m.hd.p99.toFixed(1)}  vs  agrandissement ${m.up.mean.toFixed(2)} / ${m.up.p99.toFixed(1)} ; sd lum ${m.sd.toFixed(1)}`);
  check(m.dims[0] === 3508 && m.dims[1] === 4961, 'PNG relu par un navigateur : dimensions A3 exactes');
  check(m.sd > 8, 'l’A3 n’est pas vide (variation de luminosité dans le tableau)');
  check(m.blankRatio < 0.9, 'l’A3 n’est pas uniforme sur la page');
  check(m.hd.mean >= m.up.mean * 1.02 && m.hd.p99 >= m.up.p99 * 1.02, 'l’A3 est plus net qu’un agrandissement lissé du petit format');

  // reconstruction seule (sans grain) : ne doit pas être plus floue
  const ng = await page.evaluate(async () => { const c = await window.__lab.hdCanvas('A4', { grain: 0 }); const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, 20).data; return [c.width, c.height, d.length]; });
  check(ng[0] === 2480 && ng[1] === 3508, 'hdCanvas sans grain : mêmes dimensions');

  // retours d'état
  check(/enregistré/.test(await page.textContent('#hdM')), 'message de fin : ' + (await page.textContent('#hdM')));
  check(errs.length === 0, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await ctx.close();

  // ───── paysage : la page suit le tableau
  const c2 = await browser.newContext({ viewport: { width: 900, height: 650 }, acceptDownloads: true }); const p2 = await c2.newPage();
  await p2.route(/cloudflareinsights/, r => r.abort()); await toFin(p2);
  const l4 = pngSize((await download(p2, 'A4')).f); check(l4.w === 3508 && l4.h === 2480, `paysage : A4 ${l4.w}×${l4.h}`); await c2.close();

  // ───── mobile / mémoire limitée : A3 refusé avec message, A4 accepté
  const c3 = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, acceptDownloads: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const p3 = await c3.newPage(); await p3.route(/cloudflareinsights/, r => r.abort()); await toFin(p3);
  let got = false; p3.on('download', () => { got = true; });
  await p3.click('[data-a=hd-A3]'); await p3.waitForTimeout(1200);
  const msg = await p3.textContent('#hdM');
  check(!got && /A3.*trop lourd/.test(msg) && /A4/.test(msg), 'mobile (UA iPhone simulé) : A3 refusé, message clair, A4 proposé');
  const m4 = pngSize((await download(p3, 'A4')).f); check(m4.w === 2480 && m4.h === 3508, 'mobile simulé : A4 accepté');
  await c3.close();
  const c4 = await browser.newContext({ viewport: { width: 600, height: 900 } }); const p4 = await c4.newPage();
  await p4.route(/cloudflareinsights/, r => r.abort()); await toFin(p4, '&hdenv=mem2');
  await p4.click('[data-a=hd-A3]'); await p4.waitForTimeout(800);
  check(/trop lourd/.test(await p4.textContent('#hdM')), 'mémoire limitée (2 Go simulés) : A3 refusé avec message');
  await c4.close();
} catch (e) { ko++; console.log('  FAIL exception : ' + e.message); }
await browser.close(); srv.close(); if (process.env.KEEP) console.log("  fichiers gardés : " + tmp); else fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${ok} ok, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
