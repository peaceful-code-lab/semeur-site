# Brancher peacefulcode sur un hébergement hors GitHub Pages (L-011)
Résumé : recommandation Cloudflare Pages (gratuit), sous-domaine `semeur.peacefulcode.com` en CNAME. Rien n'a été touché (aucun DNS, rien publié). Écrit le 2026-10-28.

## 1. Choix d'hébergement (3 lignes)
- **Cloudflare Pages (recommandé)** : gratuit, dépôt de dossier statique par glisser-déposer ou `wrangler pages deploy`, HTTPS automatique, limites gratuites 20 000 fichiers / 25 MiB par fichier (1 000 fichiers en glisser-déposer). Doc : https://developers.cloudflare.com/pages/platform/limits/ et https://developers.cloudflare.com/pages/get-started/direct-upload/
- **GitHub Pages (actuel)** : gratuit, mais « not intended for or allowed to be used … to run your online business, e-commerce site » : bloque toute offre future. Doc : https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- Autres (Netlify, etc.) : NON vérifiés ici. Conditions commerciales de Cloudflare Pages gratuit : non précisées dans la doc consultée, à relire avant d'ouvrir une offre.

## 2. Manips (Nico), dans l'ordre
1. Créer un compte sur dash.cloudflare.com (courriel + mot de passe à toi, 2FA conseillée). Rien à me donner.
2. Workers & Pages > Create application > Get started > **Drag and drop your files** ; nom du projet `semeur` ; glisser le dossier `projets/site-unique/` (copie sur ton poste) ; Deploy. Résultat : `semeur.pages.dev` (si le nom est pris, Cloudflare en propose un autre ; note-le).
   - Vérifier que `semeur.pages.dev` s'ouvre avant de toucher au DNS. Le PDF et les vidéos doivent faire moins de 25 MiB chacun et moins de 1 000 fichiers au total (non vérifié sur ce dossier : me le dire si refus).
3. Projet > **Custom domains** > Set up a domain > `semeur.peacefulcode.com`. Toujours passer par ce tableau d'abord : un CNAME créé sans cela donne une erreur 522.
4. Chez ton registrar/hébergeur DNS actuel de peacefulcode.com, créer UN enregistrement :

| Type | Nom | Cible |
|---|---|---|
| CNAME | `semeur` (ou `semeur.peacefulcode.com` selon l'interface) | `semeur.pages.dev` (ton nom de projet + `.pages.dev`) |

   Source : https://developers.cloudflare.com/pages/configuration/custom-domains/ (sous-domaine : pas besoin de mettre le domaine chez Cloudflare).
5. Attendre (quelques minutes à quelques heures, non chiffré par la doc) ; l'état passe à Active dans Cloudflare.
6. **Domaine racine** (`peacefulcode.com` sans `semeur.`) : exige de transférer les **serveurs de noms** du domaine vers Cloudflare (même doc). Plus lourd, touche courriel et autres enregistrements : à ne faire qu'après avoir exporté/noté tous les enregistrements actuels. Recommandation : rester sur `semeur.` pour l'instant.
7. Si une ligne CAA existe sur le domaine, elle doit autoriser Cloudflare (même doc).

## 3. HTTPS
Certificat géré par Cloudflare une fois le domaine actif (la doc consultée ne détaille pas le délai : vérifier que `https://semeur.peacefulcode.com` s'ouvre sans alerte).

## 4. Ancienne adresse GitHub Pages
- Le `_redirects` de Cloudflare (`/ancien https://… `) ne s'applique qu'aux sites sur Cloudflare (https://developers.cloudflare.com/pages/configuration/redirects/) : il ne peut pas rediriger depuis github.io.
- Piste NON vérifiée : laisser dans le dépôt `peaceful-code-lab/semeur-site` une page `index.html` avec `<meta http-equiv="refresh" content="0;url=https://semeur.peacefulcode.com/">` + lien, ou, plus simple, laisser l'ancienne adresse telle quelle (elle est en noindex). À décider avec moi ; je prépare la page, c'est toi (ou le rôle Write) qui pousses.
- Côté site : adapter les `og:url` / `og:image` de le-mur/ et semeur-site/ (encore sur peaceful-code-lab.github.io) vers la nouvelle adresse : je le fais après ta confirmation de l'adresse finale.

## 5. Retour arrière
Supprimer le CNAME `semeur` chez ton fournisseur DNS, puis retirer le domaine dans Cloudflare (menu « ... » du domaine). L'ancienne adresse GitHub Pages reste en ligne tant que je n'y touche pas. Aucune perte.

## 6. Ce que Nico me donne
- Le nom exact du projet `.pages.dev` et le domaine final choisi (`semeur.peacefulcode.com` ?), en clair dans le chat : rien de secret.
- Le nom du fournisseur DNS actuel de peacefulcode.com (pour adapter les libellés de l'étape 4).
- Jamais de mot de passe ni de jeton dans le chat. Si un jour je dois déployer moi-même (`wrangler`), jeton API Cloudflare limité à Pages, écrit par toi d'un coup dans `~/.secrets/cloudflare`.

## Non vérifié
Délais de propagation/certificat ; conditions d'usage commercial du plan gratuit Cloudflare ; alternatives à Cloudflare ; redirection depuis github.io ; contenu réel du dossier vs limites.

Mis à jour : 2026-10-28
