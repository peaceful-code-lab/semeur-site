// Export haute définition : dimensions, échelle, mise en page, repli mémoire (logique pure de moteur.js).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../public/le-mur/moteur.js');

describe('Dimensions d’impression (300 dpi)', () => {
  test('Given A4 et A3, Then 2480×3508 et 3508×4961', () => {
    assert.deepEqual(M.PRINT.A4, { w: 2480, h: 3508 });
    assert.deepEqual(M.PRINT.A3, { w: 3508, h: 4961 });
  });
  test('Given un tableau portrait, Then la page est portrait aux dimensions exactes', () => {
    for (const [f, w, h] of [['A4', 2480, 3508], ['A3', 3508, 4961]]) {
      const L = M.exportLayout(f, 360, 640);
      assert.equal(L.pw, w); assert.equal(L.ph, h); assert.equal(L.land, false);
    }
  });
  test('Given un tableau paysage, Then la page est paysage (largeur et hauteur échangées)', () => {
    const L = M.exportLayout('A3', 640, 360);
    assert.equal(L.pw, 4961); assert.equal(L.ph, 3508); assert.equal(L.land, true);
  });
  test('Then le tableau entier tient dans la page, sans rognage, et garde ses proportions', () => {
    for (const [W, H] of [[360, 640], [640, 360], [500, 560], [640, 400], [120, 640]])
      for (const f of ['A4', 'A3']) {
        const L = M.exportLayout(f, W, H);
        assert.ok(L.x >= L.margin - 1 && L.x + L.iw <= L.pw - L.margin + 1, 'horizontal');
        assert.ok(L.y >= L.margin - 1 && L.y + L.ih <= L.capY + 1, 'vertical, au-dessus de la légende');
        assert.ok(Math.abs(L.iw / L.ih - W / H) < 0.01, 'proportions');
        assert.ok(Math.abs(L.iw - W * L.scale) <= 0.5 && Math.abs(L.ih - H * L.scale) <= 0.5, 'échelle');
      }
  });
  test('Then l’échelle est bien supérieure à 1 (on redessine, on ne réduit pas) et A3 > A4', () => {
    const a4 = M.exportLayout('A4', 640, 360), a3 = M.exportLayout('A3', 640, 360);
    assert.ok(a4.scale > 3 && a3.scale > a4.scale);
  });
  test('Then format inconnu : erreur claire', () => { assert.throws(() => M.exportLayout('A2', 640, 360), /format inconnu/); });
});

describe('Repli mémoire / appareil', () => {
  test('Given un ordinateur, Then A4 et A3 disponibles', () => {
    const a = M.exportFormats({ mobile: false, memGB: 8 });
    assert.equal(a.A4, true); assert.equal(a.A3, true);
    assert.deepEqual(M.exportPlan('A3', { mobile: false, memGB: null }), { ok: true, fmt: 'A3', downgraded: false });
  });
  test('Given un mobile (canevas ≤ 16,7 Mpx), Then A3 (17,4 Mpx) refusé, A4 (8,7 Mpx) accepté', () => {
    assert.ok(M.PRINT.A3.w * M.PRINT.A3.h > M.SAFE_CANVAS_PX && M.PRINT.A4.w * M.PRINT.A4.h < M.SAFE_CANVAS_PX);
    const p = M.exportPlan('A3', { mobile: true });
    assert.equal(p.ok, false); assert.equal(p.fmt, 'A4'); assert.equal(p.downgraded, true); assert.ok(p.why);
    assert.equal(M.exportPlan('A4', { mobile: true }).ok, true);
  });
  test('Given 2 Go de mémoire, Then A4 seulement ; 0,5 Go : rien, avec un motif', () => {
    const a = M.exportFormats({ mobile: false, memGB: 2 }); assert.equal(a.A4, true); assert.equal(a.A3, false);
    const b = M.exportPlan('A4', { mobile: false, memGB: 0.5 });
    assert.equal(b.ok, false); assert.equal(b.fmt, null); assert.ok(b.why);
  });
  test('Given aucune info d’appareil, Then pas d’exception', () => { assert.doesNotThrow(() => M.exportPlan('A3')); });
});

describe('Interpolation', () => {
  test('Catmull-Rom : poids de somme 1, t=0 donne l’échantillon 1, t→1 l’échantillon 2', () => {
    for (const t of [0, .25, .5, .99]) { const w = M.catmull(t, [0, 0, 0, 0]); assert.ok(Math.abs(w.reduce((a, b) => a + b) - 1) < 1e-9); }
    assert.deepEqual(M.catmull(0, [0, 0, 0, 0]).map(x => Math.round(x * 1e9) / 1e9 + 0), [0, 1, 0, 0]);
  });
});
