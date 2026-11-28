# Frontend Interface Rules

Direction UI/UX pour tout travail frontend. Complète les non-négociables du CLAUDE.md racine (erreurs via `getErrorMessage`, `<QueryState>`, ramps sémantiques sans `dark:`, spinners `ui/loading`, `useConfirm()`, overlays sur `ui/dialog`, `DocumentListPage`). En cas de conflit, le CLAUDE.md racine gagne.

Source de référence : https://interfaces.dev/cheat-sheet — adaptée ici au stack (Tailwind ^3.4, shadcn-style, UI en français).

## UI

- Border radius **concentrique** sur les éléments imbriqués : radius interne = radius externe − padding (ex. carte `rounded-xl` + padding `p-2` → enfant `rounded-lg`).
- Aligner **optiquement**, pas géométriquement (icônes avec texte, chevrons, badges).
- Images : outline `1px` offset `-1px` — noir 8% en clair, blanc 8% en sombre (`ring-1 ring-inset ring-black/[.08] dark:ring-white/[.08]` — seule exception tolérée à la règle "pas de `dark:`", car ce n'est pas une ramp sémantique).

## Direction (passe *unslop* du 2026-10-30 — [docs/design/UNSLOP-2026-10-30.md](../docs/design/UNSLOP-2026-10-30.md))

- **Le bleu veut dire « on peut agir »** : boutons, liens dans le texte, focus, sélection — plus la seule valeur « encrée » d'un graphique. Rien de décoratif n'est bleu, aucun statut n'est bleu (`info` est un bleu ciel distinct). Un identifiant dans une liste ou un tableau est en couleur de texte avec `underline-offset-4 hover:underline` : c'est la ligne qui est le lien, pas une colonne bleue.
- **Signature : numéros de pièce et références en mono** — `<DocumentCode>` (`ui/document-code`), poids normal, comme le numéro d'un carnet à souches. Partout où un code s'affiche (listes, fiches, caisse, recherche, cartes mobiles), nulle part ailleurs. `DocumentListPage` le fait pour sa colonne principale.
- **Pas d'icône qui décore** : ni devant le `h1` (la prop n'existe plus), ni devant un titre de carte, ni dans une tuile d'indicateur (`StatTile` n'en prend plus), ni sur un bouton d'action de ligne (texte seul, même verbe pour la même action). Une icône reste quand elle explique : bouton icône seule avec `aria-label`, état vide, pastille d'en-tête.
- **Pastille = exception** : pas de pastille pour l'état normal (« Actif », « Complet », « Paiement direct »), seulement pour l'exception (« Inactif », « Partiel »). `StatusBadge` n'affiche son icône qu'en `size="md"` (en-tête) ; « Annulé(e) » est neutre, un refus reste rouge. Une catégorie est un `<Tag hue>` : point + texte, sans cadre.
- **Action destructrice au repos** : icône `text-muted-foreground hover:bg-danger-50 hover:text-danger-700`, jamais rouge avant le survol.
- **Graphiques** : barres au repos en `CHART_REST` (graphite), l'accent `CHART_PRIMARY` sur la seule valeur qui compte (`maxIndex()` de `lib/chartColors`), dite aussi en mots ; une part = une barre empilée ou une liste classée à barres fines ; jamais deux graphiques de même taille côte à côte.
- **Indicateurs** : libellé, chiffre, comparaison — pas d'icône ni de mini-graphique ; un compte qui répète une puce de filtre ou le tableau n'a pas sa tuile — il va dans la puce (`DocumentListPage` : `chipCounts`, et `statTiles` reste vide s'il n'y a pas de montant). Le chiffre qui répond à la page passe en `size="lg"` sur une colonne plus large.
- **Surfaces : des feuilles sur le comptoir** (passe du 2026-11-10) — la zone de contenu est sur `bg-canvas` (un cran sous le blanc en clair, la page en sombre), les cartes sont blanches avec un filet et **sans ombre** (`Card` n'a plus `shadow-sm` : ne pas en remettre). Rail, barre du haut, champs, menus et boutons contour restent sur `bg-background`. Un squelette est en `bg-muted-foreground/10` (visible sur la carte comme sur le fond).
- **État final de routine = texte** : dans une liste, « Payée », « Reçue », « Livré », « Approuvé », « Payé » s'écrivent en texte discret (`settled: true` dans `StatusBadge`, rendu en `size="sm"` seulement) ; la pastille reste pour ce qui attend quelque chose. Ne pas marquer `settled` un statut qui appelle une action (« Confirmé », « Livrée » d'une demande, « Disponible »).
- **Synthèse d'une liste = un bandeau** : `StatsBar` rend une seule carte à cellules séparées par un filet (libellé, puis chiffre et indication sur la même ligne), pas une rangée de cartes. Les tuiles `StatTile` en carte restent pour les tableaux de bord.
- **Bouton primaire désactivé = gris neutre** (dans `ui/button`) : jamais un bleu pâle qui se lit encore comme une action. **Chaîne du document** (`DocumentLifecycle`) : seules les pièces qui existent, rien du tout pour une pièce isolée.
- **Menu** : lignes de 32 px espacées de 2 px au bureau (44 px dans le tiroir mobile).
- **Un fait, une place** : une fiche ne répète pas son en-tête dans une carte « Informations » (client, date, échéance vont dans la ligne sous le titre) ; une carte de tableau de bord porte son propre décompte dans son titre plutôt qu'une tuile au-dessus.

## Animation

- Jamais `transition-all` — nommer les propriétés exactes (`transition-colors`, `transition-transform`, `transition-opacity`).
- Boutons pressés : scale `0.95`–`0.98` (`active:scale-[0.97]`), déjà dans `ui/button`. **Transitionner `transform`, pas `scale`** : en Tailwind 3 les utilitaires `scale-*` écrivent dans `transform` — `transition-[…,scale]` compile sans erreur et n'anime rien.
- Swap d'icônes : cross-fade — l'entrante scale `0.25→1`, opacity `0→1`, blur `4px→0`; la sortante inverse.
- Transitions CSS pour les interactions (interruptibles) ; keyframes pour les séquences one-shot uniquement.
- **Désactiver toutes les transitions** pendant le changement de thème clair/sombre.
- `will-change` uniquement sur les propriétés qui changent réellement (`transform`, `opacity`, `filter`). Élément qui shift de 1-2px en animant (Safari iOS) → `will-change: transform`.
- Entrées : stagger par groupe ou par élément.
- Ne pas animer les interactions haute fréquence (hover de ligne dans une liste).

## Typographie

- Web : `.woff2` uniquement, jamais `.ttf`/`.otf`. Inter est **auto-hébergée** en variable dans `public/fonts/` (déclarée en `@font-face` dans `index.css`) — ne pas réintroduire de `<link>` vers un CDN de polices : une requête externe de plus en 3G, et l'ouverture hors ligne prévue au lot 29-F en dépend.
- Chiffres tabulaires **sur les nombres seulement**, jamais sur une ligne ou une cellule entière : avec Inter, `tnum` élargit aussi le trait d'union (« Jean - Pierre »). Cellule chiffrée → `<TableCell numeric>` / `<TableHead numeric>` / `<DataCardRow numeric>` (droite, tabulaire, sans retour à la ligne) ; montant → `<Money>` (`ui/money`, tabulaire, « — » quand la valeur manque, jamais 0) ; KPI → `<StatTile>`. Les formateurs de `utils/format.ts` posent l'espace insécable (U+00A0) entre les milliers et avant « FCFA ».
- Poids : 400 et 500 ; 600 réservé au total d'un document (`<Money emphasis>`) et au `h1` — jamais sur chaque ligne d'un tableau ni sur chaque titre de carte (`CardTitle` et les chiffres de `StatTile` sont à 500). Pas de libellé en capitales espacées (`uppercase tracking-wider`) : casse de phrase, 12 px, `text-muted-foreground`.
- Ponctuation finale : un sous-titre, une description de carte ou de dialogue, une légende ou un état vide d'**une seule phrase** n'a pas de point final ; un paragraphe de plusieurs phrases garde les siens. Les messages d'erreur et les toasts gardent leur ponctuation.
- Texte long : 60–75 caractères par ligne (`max-w-prose`).
- `text-wrap: balance` sur les titres, `text-wrap: pretty` sur les descriptions, aucun des deux en texte long.
- `overflow-wrap: break-word` (`break-words`) là où références/liens/IDs longs peuvent déborder ; `whitespace-nowrap` sur labels et badges.
- `-webkit-font-smoothing: antialiased` + `-moz-osx-font-smoothing: grayscale` une fois à la racine (`index.css`), jamais par composant.
- Copie stockée en casse naturelle ; présentation via `text-transform`/`uppercase`.
- Ponctuation soignée : guillemets français « », tiret demi-cadratin pour les plages, caractère ellipse unique « … ».
- `text-underline-position: from-font` + `text-decoration-skip-ink: auto` pour que les soulignés évitent les descendantes.
- Texte tronqué (`truncate`) : la valeur complète reste accessible (tooltip via `title` ou vue étendue).

## Couleurs

- Chaque step d'une ramp a un usage (fond de page, hover, bordure, fill, texte). Pas de step orphelin.
- Composants → **tokens sémantiques** (les CSS vars de `index.css` / `semanticRamp()`), jamais de primitives (`blue-500`). Les cinq rampes passant par `semanticRamp()` sont `success`, `warning`, `danger`, `info` et `primary` : toutes s'inversent en `.dark`, donc **aucune variante `dark:` dessus**. Une couleur écrite en hex dans `tailwind.config.js` n'est pas theme-aware — c'était le bug de la rampe `primary` avant le 2026-08-27.
- **Texte de statut = un step explicite** : `text-success-700`, `text-warning-700`, `text-danger-700`, `text-info-700`. Depuis le 2026-10-23 la valeur par défaut de chaque rampe (`text-success`, `bg-warning`…) vaut son step 600 : lisible comme accent, mais un fond plein avec texte blanc n'est plus supporté (fond plein → `bg-X-600 text-X-50`). ESLint signale tout `text-success|warning|danger|info|destructive` sans step. Les pastilles de statut passent par `<StatusBadge type statut>` (pastille douce, source unique des libellés) ; les puces de filtre se construisent avec `getStatusOptions(type)` pour employer les mêmes mots.
- **Statut ≠ catégorie.** Les rampes ci-dessus portent un sens (succès, alerte, erreur, info). Pour seulement *distinguer* N éléments entre eux — modes de paiement, types de mouvement, journaux, rôles — utiliser `<Tag hue={1..7}>` (`ui/tag` : texte en couleur de premier plan + pastille `bg-chart-N`, `hueFromKey()`, `paymentMethodHue()`). L'ancienne recette `bg-chart-N/15 text-chart-N` échouait au contraste AA pour 5 teintes sur 7 : ne plus l'utiliser. Ne pas détourner `success`/`warning` parce que la teinte tombe juste.
- Le fichier `src/` ne doit plus contenir **aucune** primitive Tailwind brute (`bg-blue-500`, `text-gray-700`…) ni **aucun** `dark:` : les deux sont tombés à zéro le 2026-08-27, un `grep` suffit à le vérifier.
- Nommer un token par son rôle, jamais par son apparence ou son premier usage.
- Ne pas réutiliser un token d'un autre rôle parce que "c'est la bonne couleur" — ajouter un token pour le nouveau rôle.
- Contraste mesuré contre le fond **réel** de l'élément, pas le fond de page.
- La palette dark n'est pas la palette light inversée (nos ramps sémantiques gèrent déjà l'inversion — ne jamais ajouter `dark:` dessus, cf. CLAUDE.md racine).
- Un seul mécanisme de switch de thème : ici c'est la classe `.dark` (ThemeContext) — tous les tokens passent par lui, jamais `prefers-color-scheme` en parallèle.
- Gradients : `in oklab` pour une luminosité uniforme, `in oklch` pour des tons médians vifs.

## Accessibilité

- Éléments natifs sémantiques : `<button>` pour bouton, `<a>` pour lien, jamais un `<div>` cliquable.
- Styler `:focus-visible` ; jamais `outline: none` sans remplacement.
- `tabindex` : uniquement `0` et `-1` — les valeurs positives cassent l'ordre de tabulation.
- Boutons icône-seule : `aria-label` descriptif (en français) ; jamais `aria-hidden="true"` sur un élément focusable.
- Alt par fonction (`alt="Rechercher"` sur un bouton recherche), `alt=""` si décoratif.
- Chaque input : vrai `<label>` (le `ui/label` Radix), `type` et `inputMode` corrects — `inputMode="numeric"` pour un entier (quantité, stock), `"decimal"` pour un montant ou un taux. Sans ça, le clavier mobile s'ouvre en mode texte.
- Erreur de champ : toujours la paire `fieldErrorProps(id, error)` + `<FieldError id={id}>` (`ui/field-error`). Un `aria-invalid` seul annonce « champ invalide » sans jamais dire pourquoi — c'est `aria-describedby` qui relie le message.
- **Jamais bloquer le collage** (mots de passe, codes).
- Un tooltip sur un contrôle `disabled` ne s'ouvre ni au clavier ni au touch : mettre l'explication en texte visible à côté, ou `aria-disabled="true"` pour garder le focus.
- Submit reste actif jusqu'au départ de la requête ; validation au submit : `aria-invalid="true"`, `aria-describedby` vers l'erreur, focus sur le premier champ invalide (react-hook-form + zod le permettent — brancher les attributs).
- Hit-area ≥ `24×24px`, `44×44px` touch, `40×40px` desktop si possible ; les zones étendues ne se chevauchent jamais.
- `pointer-events: none` sur le décoratif (glows, gradients) pour ne pas avaler les clics. Cas le plus fréquent ici : l'icône loupe posée en `absolute` par-dessus un champ de recherche — sans cette classe, le clic sur l'icône ne met pas le focus dans le champ.
- Tiroir / panneau latéral : `ui/sheet` (Radix Dialog), jamais un `fixed inset-0` fait main — piège de focus, Échap et verrouillage du défilement viennent avec.
- Styles hover derrière `@media (hover: hover)` (Tailwind ^3.4 : activer `hoverOnlyWhenSupported` si besoin) — sur touch, `:hover` colle après un tap.
- Motion derrière `@media (prefers-reduced-motion: no-preference)` (`motion-safe:` en Tailwind).
- `role="status"` pour les mises à jour de routine, `role="alert"` uniquement pour les erreurs urgentes (sonner gère déjà les toasts — ne pas doubler).
- Un changement de statut n'utilise **jamais la couleur seule** : ajouter icône, label ou soulignement (nos badges de statut ont déjà le label texte — maintenir).
- Lien "aller au contenu" = premier élément focusable ; `scroll-margin-top` sur les titres ancrés.
- **Accès par rôle — une seule source** : `config/routeAccess.ts` (`APP_ROUTES`) alimente le menu, le routeur, la recherche globale, les raccourcis et la page « Accès réservé ». Tout lien ou bouton qui mène à une autre page passe par `useRouteAccess()` (`canOpen(path)`) : un rôle ne voit jamais un lien qu'il ne peut pas ouvrir. Une action que l'API refuse à un rôle n'est pas affichée à ce rôle.
- Raccourcis : jamais F1/F5/F6 (le navigateur en a besoin) ; les raccourcis à une touche se désactivent par utilisateur (`useSingleKeyShortcuts`) et ne se déclenchent pas dans un champ, un menu ou une boîte de dialogue (`canRunSingleKeyShortcut`).
- Sélection exclusive (mode de paiement, décision, période) : `ChoiceGroup` (`ui/choice-chips`, groupe radio) — l'état choisi est exposé, pas seulement coloré. Filtre bascule : `ToggleChip` (`aria-pressed`), jamais des onglets sans panneau.

## Layout

- **Chaque page rend un `PageShell`** (`ui/page-shell`) dans **toutes** ses branches (chargement, erreur via `QueryErrorState`, introuvable, contenu) : il porte la gouttière, la largeur (`width="full|wide|narrow"`), le seul `h1`, le titre d'onglet « page · entreprise » et l'en-tête (une seule action primaire, les actions destructives dans « Plus d’actions »). Jamais le `container` Tailwind (pas de padding dans cette config).
- Carte sans `CardHeader` : `<CardContent inset="standalone">` (l'ancien piège `sm:pt-0` n'existe plus — une classe de padding passée par la page l'emporte toujours).
- État dans l'URL (filtres, page, tri, panneau ouvert) : toujours par `useSearchParamsPatch()` / `useUrlState` (`hooks/useUrlState.ts`), **une seule écriture par action utilisateur**. Deux `setSearchParams` dans le même gestionnaire s'écrasent (React Router fournit les paramètres du dernier rendu) : c'est ce qui rendait inopérants les filtres et la recherche de 8 listes jusqu'au 2026-10-24.
- Liste de plus de 4 colonnes : une vue carte sur mobile (`ResponsiveTable` / `DataCard`, ou la carte générée par `DocumentListPage`). Un tableau qui peut déborder porte un `aria-label` (il devient une région défilante nommée et focusable).
- Écart entre groupes ≥ 2× l'écart interne : `gap-2` dedans, `gap-4`+ entre.
- Propriétés logiques (`ms-*`/`me-*`, `ps-*`/`pe-*`) plutôt que left/right.
- Pas de largeur/hauteur fixe sur les conteneurs de texte.

## Écriture (UI en français)

- Labels de boutons commencent par un **verbe** : « Enregistrer le brouillon », « Supprimer la facture » — jamais « OK » ni « Oui » nu.
- Boutons de confirmation répètent la conséquence : « Supprimer la facture » à côté de « Annuler ».
- Un mot par flux, tenu à chaque étape : « Continuer » ou « Suivant », jamais les deux.
- Texte de lien = destination (« Voir la documentation »), jamais « Cliquez ici ».
- Casse cohérente partout ; la casse de phrase (sentence case) est le défaut.
- Toggles nommés par l'état qu'ils **activent** : « Envoyer les relances », jamais « Désactiver les relances ».
- États vides : orienter le lecteur + une action suivante, pas « Aucun résultat » sec.
- S'adresser au lecteur en « vous ».
