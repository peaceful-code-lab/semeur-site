// Scénarios de comportement du Mur (logique pure de public/le-mur/moteur.js).
// Lancer : node --test tests/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../public/le-mur/moteur.js');
const { ACT } = M;
const DT = 1 / 60;

// Simule `secondes` de temps avec une vitesse de doigt donnée ; renvoie les événements.
function simuler(s, secondes, vitesse) {
  const ev = { coupures: 0, depots: 0, pas: 0 };
  for (let i = 0; i < Math.round(secondes * 60); i++) {
    const r = M.strokeTick(s, vitesse, DT);
    ev.pas++; if (r.deposit) ev.depots++; if (r.newStroke) ev.coupures++;
  }
  return ev;
}

describe('Trait libre', () => {
  test('Given un doigt qui bouge, When il bouge 10 s, Then aucune coupure et le trait dépose', () => {
    const s = M.newStroke(); const ev = simuler(s, 10, 3);
    assert.equal(ev.coupures, 0); assert.equal(ev.depots, ev.pas); assert.equal(s.strokes, 1);
  });
  test('Given un doigt qui bouge, When il reste posé 3 s, Then un nouveau trait commence', () => {
    const s = M.newStroke(); simuler(s, 2, 3);
    const ev = simuler(s, 3, 0);
    assert.equal(ev.coupures, 1); assert.equal(s.strokes, 2);
  });
  test('Given un doigt posé 2 s seulement, When il repart, Then pas de coupure (trait continu)', () => {
    const s = M.newStroke(); simuler(s, 2, 0); const ev = simuler(s, 2, 3);
    assert.equal(ev.coupures, 0); assert.equal(s.strokes, 1);
  });
  test('Given un doigt posé, When la pause dure, Then le dépôt s\'arrête après un bref instant puis reprend au nouveau trait', () => {
    const s = M.newStroke(); let dep = [];
    for (let i = 0; i < 3 * 60; i++) dep.push(M.strokeTick(s, 0, DT).deposit);
    assert.equal(dep[0], true);                 // l'instant de grâce
    assert.equal(dep[Math.round(1.5 * 60)], false); // pleine pause
    assert.equal(dep[Math.round(2.5 * 60) - 1], true); // le nouveau trait recommence
  });
  test('Given un doigt immobile 10 s, When on compte, Then un nouveau trait toutes les 2,5 s (4 traits de plus)', () => {
    const s = M.newStroke(); simuler(s, 10.02, 0); assert.equal(s.strokes, 5);
  });
  test('Given un trait très long, When la fatigue joue, Then il s\'amenuise sans jamais passer sous 25 %', () => {
    assert.ok(M.fatigue(0) > M.fatigue(5)); assert.equal(M.fatigue(1000), 0.25);
  });
  test('Given un nouveau trait, When il commence, Then son âge et sa distance repartent de zéro', () => {
    const s = M.newStroke(); simuler(s, 3, 3); simuler(s, 2.6, 0); assert.equal(s.dist, 0);
  });
});

describe('Phases', () => {
  test('Given le mur, When on appuie sur Continuer, Then la pause suit', () => assert.equal(M.skipTarget(ACT.MUR), ACT.PAUSE));
  test('Given la pause, When Continuer, Then la question voix/doigt s\'ouvre (une seule fois)', () => {
    assert.equal(M.skipTarget(ACT.PAUSE, { asking: false }), 'ASK'); assert.equal(M.skipTarget(ACT.PAUSE, { asking: true }), null);
  });
  test('Given le geste, When Continuer, Then la pose suit', () => assert.equal(M.skipTarget(ACT.GESTE), ACT.POSE));
  test('Given la pose, When Continuer, Then la fin suit', () => assert.equal(M.skipTarget(ACT.POSE), ACT.FIN));
  test('Given la fin figée, When Continuer, Then rien ne se passe', () => {
    assert.equal(M.skipTarget(ACT.POSE, { frozen: true }), null); assert.equal(M.skipTarget(ACT.FIN), null);
  });
  test('Given un prologue ou des couleurs, When Continuer, Then le bouton n\'a pas d\'effet', () => {
    assert.equal(M.skipTarget(ACT.PRO), null); assert.equal(M.skipTarget(ACT.AMB), null);
  });
});

describe('Minuteurs', () => {
  const D = M.durations(1);
  test('Given les durées de base, Then mur 75, pause 45, geste 150, pose 36 s', () => {
    assert.deepEqual(D, { mur: 75, pause: 45, geste: 150, pose: 36 });
  });
  test('Given ?dur=0.1, Then les durées sont divisées par dix', () => assert.equal(M.durations(0.1).geste, 15));
  test('Given le geste, When 150 s passent, Then il se termine seul (pas avant)', () => {
    assert.equal(M.gesteOver(149, D, 0), false); assert.equal(M.gesteOver(151, D, 0), true);
  });
  test('Given la pose, When 36 s passent, Then la fin arrive', () => {
    assert.equal(M.poseOver(35, D), false); assert.equal(M.poseOver(37, D), true);
  });
  test('Given le geste, When on appuie sur Plus de temps, Then +60 s', () => {
    const r = M.moreTime({ extN: 0, ext: 0 }, 1); assert.deepEqual(r, { extN: 1, ext: 60, ok: true });
    assert.equal(M.gesteOver(151, D, r.ext), false); assert.equal(M.gesteOver(211, D, r.ext), true);
  });
  test('Given Plus de temps, When on appuie 8 fois, Then 5 fois seulement (max +300 s)', () => {
    let st = { extN: 0, ext: 0 }, oks = 0;
    for (let i = 0; i < 8; i++) { const r = M.moreTime(st, 1); if (r.ok) oks++; st = r; }
    assert.equal(oks, 5); assert.equal(st.ext, 300); assert.equal(M.canMore(ACT.GESTE, st.extN), false);
  });
  test('Given le mur ou la pause, Then Plus de temps n\'est pas proposé', () => {
    assert.equal(M.canMore(ACT.MUR, 0), false); assert.equal(M.canMore(ACT.PAUSE, 0), false);
    assert.equal(M.canMore(ACT.GESTE, 0), true); assert.equal(M.canMore(ACT.POSE, 4), true);
  });
  test('Given la barre de progression, Then elle suit pause, geste (avec prolongation) et pose, rien au mur', () => {
    assert.equal(M.progress(ACT.MUR, 10, D, 0), -1);
    assert.equal(M.progress(ACT.PAUSE, 22.5, D, 0), 0.5);
    assert.equal(M.progress(ACT.GESTE, 75, D, 0), 0.5);
    assert.equal(M.progress(ACT.GESTE, 75, D, 150), 0.25);
    assert.equal(M.progress(ACT.POSE, 99, D, 0), 1);
  });
});

describe('Le mur : bouton Continuer', () => {
  test('Given 3 repères, When ils sont posés, Then Continuer apparaît tout de suite', () => assert.equal(M.murGo(3, 1, 1, false), 'continue'));
  test('Given 1 repère, When 10 s, Then pas encore ; When 26 s, Then oui', () => {
    assert.equal(M.murGo(1, 10, 1, false), null); assert.equal(M.murGo(1, 26, 1, false), 'continue');
  });
  test('Given aucun repère, When 76 s, Then « Rien n\'apparaît ? » avec Continuer', () => {
    assert.equal(M.murGo(0, 60, 1, false), null); assert.equal(M.murGo(0, 76, 1, false), 'rien');
  });
  test('Given le bouton déjà affiché, Then il n\'est pas réaffiché', () => assert.equal(M.murGo(5, 99, 1, true), null));
  test('Given sept repères au plus', () => assert.equal(M.MAX_MARKS, 7));
});

describe('Palette', () => {
  test('Given un coin du carré, Then une seule couleur', () => {
    for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) assert.equal(M.countColors(M.paletteWeights(u, v)), 1);
  });
  test('Given un bord, Then deux couleurs à parts égales', () => {
    const w = M.paletteWeights(0.5, 0); assert.equal(M.countColors(w), 2); assert.ok(Math.abs(w[0] - 0.5) < 1e-9);
  });
  test('Given le centre (avant : quatre couleurs), Then deux couleurs au plus', () => {
    assert.equal(M.countColors(M.paletteWeights(0.5, 0.5)), 2);
  });
  test('Given n\'importe quel point du carré, Then jamais plus de 2 couleurs et les poids font 1', () => {
    for (let u = 0; u <= 1.0001; u += 0.05) for (let v = 0; v <= 1.0001; v += 0.05) {
      const w = M.paletteWeights(u, v); assert.ok(M.countColors(w) <= M.MAX_COLORS);
      assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    }
  });
  test('Given une palette à deux couleurs, When on tire 20 fois, Then seules ces deux couleurs sortent', () => {
    const w = M.paletteWeights(0.5, 0); let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    const seen = new Set(); let bag = [];
    for (let i = 0; i < 20; i++) { if (!bag.length) bag = M.makeBag(w, rnd); seen.add(bag.pop()); }
    assert.deepEqual([...seen].sort(), [0, 1]);
  });
  test('Given une seule couleur, Then le sac ne contient qu\'elle', () => {
    assert.deepEqual(new Set(M.makeBag(M.paletteWeights(1, 1), Math.random)), new Set([3]));
  });
});
