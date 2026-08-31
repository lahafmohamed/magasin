# Frontend Interface Rules

Direction UI/UX pour tout travail frontend. Complète les non-négociables du CLAUDE.md racine (erreurs via `getErrorMessage`, `<QueryState>`, ramps sémantiques sans `dark:`, spinners `ui/loading`, `useConfirm()`, overlays sur `ui/dialog`, `DocumentListPage`). En cas de conflit, le CLAUDE.md racine gagne.

Source de référence : https://interfaces.dev/cheat-sheet — adaptée ici au stack (Tailwind ^3.4, shadcn-style, UI en français).

## UI

- Border radius **concentrique** sur les éléments imbriqués : radius interne = radius externe − padding (ex. carte `rounded-xl` + padding `p-2` → enfant `rounded-lg`).
- Aligner **optiquement**, pas géométriquement (icônes avec texte, chevrons, badges).
- Images : outline `1px` offset `-1px` — noir 8% en clair, blanc 8% en sombre (`ring-1 ring-inset ring-black/[.08] dark:ring-white/[.08]` — seule exception tolérée à la règle "pas de `dark:`", car ce n'est pas une ramp sémantique).

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

- Web : `.woff2` uniquement, jamais `.ttf`/`.otf`. Inter est **auto-hébergée** en variable dans `public/fonts/` (déclarée en `@font-face` dans `index.css`) — ne pas réintroduire de `<link>` vers un CDN de polices : ça recasserait le rendu hors ligne de la PWA.
- `tabular-nums` sur **toute valeur qui change** et dans les **tables**. `ui/table` (TableCell) et `ui/responsive-table` (DataCardRow) l'appliquent déjà ; il reste à le poser à la main sur les montants hors tableau (KPI, totaux en carte) — utilitaire `tabular-nums` ou la classe maison `.num`.
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
- **Statut ≠ catégorie.** Les rampes ci-dessus portent un sens (succès, alerte, erreur, info). Pour seulement *distinguer* N éléments entre eux — méthodes de paiement, types de mouvement, rôles — utiliser la palette catégorielle `chart-1..7` (adossée aux mêmes variables que les graphiques, déjà réglées par thème) : `bg-chart-3/15 text-chart-3`. Ne pas détourner `success`/`warning` parce que la teinte tombe juste.
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

## Layout

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
