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
      if (s.still >= CUT_S - 1e-6) { s.still = 0; s.strokes++; s.age = 0; s.dist = 0; fresh = true; }
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

  /* ───── export haute définition (impression, 300 dpi) ───── */
  const PRINT = { A4: { w: 2480, h: 3508 }, A3: { w: 3508, h: 4961 } };
  const SAFE_CANVAS_PX = 16777216;     // limite de surface d'un canevas sur iOS/Safari et beaucoup de mobiles (4096 x 4096)
  const DESK_CANVAS_PX = 268435456;    // Chrome/Firefox de bureau
  const MARGIN = 0.04, CAPTION = 0.03; // marge et bandeau de légende, en part du petit côté de la page
  /* Mise en page : la page suit l'orientation du tableau (portrait ou paysage) ; le tableau, entier,
     est centré dans la page, sans rognage, avec marge et légende. W,H = taille de la simulation. */
  function exportLayout(fmt, W, H) {
    const f = PRINT[fmt]; if (!f) throw new Error('format inconnu : ' + fmt);
    const land = W > H, pw = land ? f.h : f.w, ph = land ? f.w : f.h, sh = Math.min(pw, ph);
    const m = Math.round(sh * MARGIN), cap = Math.round(sh * CAPTION);
    const bw = pw - 2 * m, bh = ph - 2 * m - cap;
    const scale = Math.min(bw / W, bh / H);
    const iw = Math.round(W * scale), ih = Math.round(H * scale);
    return { fmt, pw, ph, land, scale, iw, ih, x: Math.round((pw - iw) / 2), y: m + Math.round((bh - ih) / 2),
      margin: m, capY: ph - m - cap, capH: cap, capFont: Math.round(cap * 0.62), pixels: pw * ph };
  }
  /* Ce que l'appareil peut produire. env = { mobile, memGB (ou null), maxPx (optionnel) }.
     Renvoie { A4: bool, A3: bool, why: { A4, A3 } } ; jamais d'exception. */
  function exportFormats(env) {
    env = env || {};
    const px = k => PRINT[k].w * PRINT[k].h;
    let max = env.maxPx || (env.mobile ? SAFE_CANVAS_PX : DESK_CANVAS_PX);
    let memCap = Infinity, memWhy = '';
    if (env.memGB != null) {
      if (env.memGB < 1) { memCap = 0; memWhy = 'mémoire de l’appareil insuffisante'; }
      else if (env.memGB < 4) { memCap = px('A4'); memWhy = 'mémoire de l’appareil limitée'; }
    }
    const out = { A4: true, A3: true, why: {} };
    for (const k of ['A4', 'A3']) {
      if (px(k) > max) { out[k] = false; out.why[k] = 'trop grand pour le canevas de cet appareil'; }
      else if (px(k) > memCap) { out[k] = false; out.why[k] = memWhy; }
    }
    return out;
  }
  /* Choix final : le format demandé, sinon A4, sinon rien. */
  function exportPlan(fmt, env) {
    const av = exportFormats(env);
    if (av[fmt]) return { ok: true, fmt, downgraded: false };
    if (fmt === 'A3' && av.A4) return { ok: false, fmt: 'A4', downgraded: true, why: av.why.A3 };
    return { ok: false, fmt: null, downgraded: false, why: av.why[fmt] };
  }
  /* poids de Catmull-Rom pour 4 échantillons, t dans [0,1) */
  function catmull(t, w) {
    const t2 = t * t, t3 = t2 * t;
    w[0] = -0.5 * t3 + t2 - 0.5 * t; w[1] = 1.5 * t3 - 2.5 * t2 + 1; w[2] = -1.5 * t3 + 2 * t2 + 0.5 * t; w[3] = 0.5 * t3 - 0.5 * t2;
    return w;
  }

  const Moteur = { PRINT, SAFE_CANVAS_PX, DESK_CANVAS_PX, exportLayout, exportFormats, exportPlan, catmull, ACT, MAX_EXT, EXT_S, MAX_MARKS, STILL_SPEED, CUT_S, GRACE_S, MAX_COLORS,
    durations, skipTarget, murGo, moreTime, canMore, gesteOver, poseOver, progress,
    newStroke, strokeTick, fatigue, paletteWeights, countColors, makeBag, clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = Moteur;
  else root.Moteur = Moteur;
})(typeof self !== 'undefined' ? self : this);
