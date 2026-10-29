/* Le Mur — logique pure (aucun accès au DOM, au canevas ni au son).
   Chargé par index.html (global `Moteur`) et par les tests node (module.exports).
   Le temps est du temps simulé, en secondes. */
(function (root) {
  'use strict';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ───── phases ───── */
  const ACT = { PRO: 0, CADRE: 1, MUR: 2, PAUSE: 3, GESTE: 4, POSE: 5, FIN: 6, AMB: 7 };
  const MAX_EXT = 5;        // « Plus de temps » : 5 fois au plus
  const EXT_S = 60;         // +60 s par appui
  const MAX_MARKS = 7;      // repères sur le mur

  function durations(DUR) {
    DUR = DUR || 1;
    return { mur: 75 * DUR, pause: 45 * DUR, geste: 150 * DUR, pose: 36 * DUR };
  }

  /* « Continuer ›» : phase suivante, ou null si le bouton ne fait rien */
  function skipTarget(act, o) {
    o = o || {};
    if (o.frozen) return null;
    if (act === ACT.MUR) return ACT.PAUSE;
    if (act === ACT.PAUSE) return o.asking ? null : 'ASK'; // la carte « voix / doigt » précède le geste
    if (act === ACT.GESTE) return ACT.POSE;
    if (act === ACT.POSE) return ACT.FIN;
    return null;
  }

  /* bouton « Continuer » du mur : 'continue' | 'rien' (texte « Rien n'apparaît ? ») | null */
  function murGo(marks, t, DUR, goShown) {
    DUR = DUR || 1;
    if (goShown) return null;
    if (marks > 0 && (marks >= 3 || t > 25 * DUR)) return 'continue';
    if (marks === 0 && t > durations(DUR).mur) return 'rien';
    return null;
  }

  /* « Plus de temps » : renvoie le nouvel état, ou le même si refusé */
  function moreTime(state, DUR) {
    DUR = DUR || 1;
    if (state.extN >= MAX_EXT) return { extN: state.extN, ext: state.ext, ok: false };
    return { extN: state.extN + 1, ext: state.ext + EXT_S * DUR, ok: true };
  }
  const canMore = (act, extN) => (act === ACT.GESTE || act === ACT.POSE) && extN < MAX_EXT;

  /* le geste se termine seul après geste + prolongations ; la pose après pose */
  const gesteOver = (t, D, ext) => t > D.geste + ext;
  const poseOver = (t, D) => t > D.pose;
  /* fraction de la barre de progression, ou -1 si pas de barre */
  function progress(act, t, D, ext) {
    let f = -1;
    if (act === ACT.PAUSE) f = t / D.pause;
    else if (act === ACT.GESTE) f = t / (D.geste + ext);
    else if (act === ACT.POSE) f = t / D.pose;
    return f < 0 ? -1 : clamp(f, 0, 1);
  }

  /* ───── trait libre : un doigt posé ≥ 2,5 s coupe le trait, un nouveau commence ───── */
  const STILL_SPEED = 0.35;  // en dessous : le doigt est « posé »
  const CUT_S = 2.5;         // durée de pause qui coupe le trait
  const GRACE_S = 0.5;       // le doigt posé dépose encore un instant, puis plus rien
  function newStroke() { return { still: 0, strokes: 1, age: 0, dist: 0 }; }
  /* un pas : speed = déplacement du pas (px simulés), dt en s.
     Renvoie { deposit, newStroke }. Mute `s`. */
  function strokeTick(s, speed, dt) {
    s.age += dt;
    let fresh = false;
    if (speed < STILL_SPEED) {
      s.still += dt;
      if (s.still >= CUT_S) { s.still = 0; s.strokes++; s.age = 0; s.dist = 0; fresh = true; }
    } else {
      s.still = 0;
      s.dist += speed;
    }
    const deposit = fresh || s.still < GRACE_S;
    return { deposit, newStroke: fresh };
  }
  /* fatigue du trait : un trait long s'amenuise, mais jamais sous 25 % */
  const fatigue = age => Math.max(0.25, Math.exp(-age / 5));

  /* ───── palette : peu de couleurs ───── */
  const MAX_COLORS = 2;
  /* (u,v) dans le carré -> poids des 4 couleurs [HG, HD, BG, BD], 2 couleurs au plus.
     Un coin = une couleur ; un bord ou le centre = deux. */
  function paletteWeights(u, v) {
    const sn = x => (x < 0.1 ? 0 : x > 0.9 ? 1 : Math.abs(x - 0.5) < 0.1 ? 0.5 : x);
    u = sn(u); v = sn(v);
    let w = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v].map(x => (x < 0.12 ? 0 : x));
    const keep = w.map((x, i) => [x, i]).filter(e => e[0] > 0).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, MAX_COLORS).map(e => e[1]);
    w = w.map((x, i) => (keep.includes(i) ? x : 0));
    const t = w.reduce((a, b) => a + b, 0) || 1;
    return w.map(x => x / t);
  }
  const countColors = w => w.filter(x => x > 0).length;
  /* sac de couleurs tirées tour à tour, proportions respectées ; rnd() dans [0,1) */
  function makeBag(w, rnd) {
    const bag = [];
    const pres = w.map((x, i) => [x, i]).filter(e => e[0] > 0);
    if (!pres.length) return bag;
    const wm = Math.min(...pres.map(e => e[0]));
    for (const [x, i] of pres) { const n = Math.max(1, Math.round(x / wm)); for (let k = 0; k < n && bag.length < 14; k++) bag.push(i); }
    for (let i = bag.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [bag[i], bag[j]] = [bag[j], bag[i]]; }
    return bag;
  }

  const Moteur = { ACT, MAX_EXT, EXT_S, MAX_MARKS, STILL_SPEED, CUT_S, GRACE_S, MAX_COLORS,
    durations, skipTarget, murGo, moreTime, canMore, gesteOver, poseOver, progress,
    newStroke, strokeTick, fatigue, paletteWeights, countColors, makeBag, clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = Moteur;
  else root.Moteur = Moteur;
})(typeof self !== 'undefined' ? self : this);
