# Le Mur — phases et ce qui déclenche chaque passage

Source : `public/le-mur/index.html` (code lu, branche mur-v3). Le temps est du temps simulé (`simT`, 60 pas/s, multiplié par `?speed=`) ; les durées de base sont multipliées par `?dur=` (`D = {mur:75, pause:45, geste:150, pose:36}` secondes). Onglet caché : le temps s'arrête (requestAnimationFrame suspendu).

## État de départ (main, avant mur-v3)

| Phase | Entrée | Sortie | Auto ? |
|---|---|---|---|
| PRO (6 cartes de prologue) | chargement | « Continuer » (ou balayage, points) ; dernière carte « Commencer » → `audioStart()` + AMB | non |
| AMB (couleurs) | « Commencer » ou « Changer de couleurs » | « Valider ces couleurs » → `ambOk` → CADRE | non (le bouton pulse après 120 s) |
| CADRE (3 règles) | `ambOk` | « Entrer » → `toMur` ; « Changer de couleurs » → AMB | non |
| MUR | « Entrer » | bouton `#go` « Continuer » → `toPause`. Il apparaît (une fois) si au moins 1 repère ET (3 repères OU t > 25 s) ; ou, sans aucun repère, à t > 75 s (avec le texte « Rien n'apparaît ? »). Max 7 repères | non : le mur attend sans limite |
| PAUSE | « Continuer » du mur | à t > 45 s : texte « Quand on veut : reprendre » + `#go` « Reprendre » → `askVoice` | non : attend sans limite |
| askVoice (carte) | « Reprendre » | « Avec la voix » / « Au doigt seul » → `toGeste` (micro demandé ici si voix) | non |
| GESTE | `toGeste` | `#go` « Laisser reposer » à t > 45 s → `toPose` ; **automatique à t > 150 s → `toPose`** | oui, 150 s |
| POSE (ça repose) | `toPose` | **automatique à t > 36 s → `toFin`** | oui, 36 s |
| FIN | `toFin` (fige la simulation, carte finale) | « Laisser disparaître » → `vanish` (≈10 s) → `showEnd` ; « Recommencer » = `location.reload()` | non |

Barre de progression (`#prog`) : calculée en `drawOv`, seulement en PAUSE (t/45), GESTE (t/150), POSE (t/36). Rien en MUR.

Constat : seuls GESTE et POSE avancent seuls. Tout le reste attend le visiteur. Les impatients n'ont pas de bouton avant 25 s (mur), 45 s (pause, geste) ; personne ne peut prolonger le geste.

## Ajouts de mur-v3

- `#skip` « Continuer › » : toujours visible en MUR, PAUSE, GESTE, POSE (en haut à droite, sous « ← Semeur »). Effet : MUR → `toPause` (même sans repère) ; PAUSE → `askVoice` ; GESTE → `toPose` ; POSE → `toFin`. Les sorties normales (`#go`) restent.
- `#more` « Plus de temps » : visible en GESTE et POSE. GESTE : +60 s par appui (le délai auto passe à 150 + 60·n, n ≤ 5, la barre suit). POSE : revient au geste avec 60 s de plus (le micro, si choisi, est ré-ouvert, sans nouvelle demande). MUR et PAUSE n'ont pas de délai : on y reste aussi longtemps qu'on veut.
- Le parcours normal (sans appui) est inchangé.
