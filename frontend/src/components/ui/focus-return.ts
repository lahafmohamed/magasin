import * as React from 'react';

/**
 * Retour du focus à la fermeture d'une fenêtre (Dialog, Sheet, tiroir de menu).
 *
 * Radix ne rend le focus qu'à un `DialogTrigger`. Ici toutes les fenêtres
 * s'ouvrent depuis un état (`open={…}`) : sans déclencheur, le focus tombait
 * sur `<body>` à la fermeture, et un utilisateur au clavier qui annulait un
 * paiement ou une suppression repartait du lien d'évitement (WCAG 2.4.3).
 *
 * L'élément qui avait le focus est lu au rendu d'ouverture — avant que
 * `autoFocus` ou le piège de focus ne le déplacent dans la fenêtre — puis
 * retrouvé à la fermeture. Un élément de menu (« Plus d’actions › Supprimer »)
 * disparaît avec son menu : on retient alors le bouton qui ouvre ce menu.
 * (Un `onOpenAutoFocus` arriverait trop tard : Radix ne l'émet pas quand un
 * champ `autoFocus` a déjà pris le focus — PaymentModal, ConfirmDialog, la
 * recherche globale.)
 */

/** Conteneurs éphémères : leurs éléments n'existent plus quand la fenêtre se ferme. */
const TRANSIENT_HOST = '[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper] > *';

/** Titre de la page courante : repli quand l'élément d'origine a disparu. */
const MAIN_HEADING = '#contenu-principal h1';

/** Attente maximale du titre d'une page chargée en différé (navigation à la fermeture). */
const HEADING_WAIT_MS = 2000;

/** Bouton qui commande un menu ou une liste : `aria-labelledby` du contenu, sinon `aria-controls` du déclencheur. */
function controllingTrigger(host: HTMLElement): HTMLElement | null {
  const labelledBy = host.getAttribute('aria-labelledby');
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      const el = id ? document.getElementById(id) : null;
      if (el && !host.contains(el)) return el;
    }
  }
  if (host.id) {
    for (const el of document.querySelectorAll<HTMLElement>('[aria-controls]')) {
      if (host.contains(el)) continue;
      if ((el.getAttribute('aria-controls') ?? '').split(/\s+/).includes(host.id)) return el;
    }
  }
  return null;
}

/**
 * Élément auquel rendre le focus : l'élément focalisé, ou — s'il vit dans un
 * menu, une liste d'options ou un popover — le bouton qui les ouvre.
 */
export function resolveOpener(start: Element | null): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let el =
    start instanceof HTMLElement && start !== document.body && start !== document.documentElement ? start : null;
  for (let hops = 0; el && hops < 4; hops++) {
    const host = el.closest<HTMLElement>(TRANSIENT_HOST);
    if (!host) break;
    const trigger = controllingTrigger(host);
    if (!trigger) break;
    el = trigger;
  }
  return el;
}

const nextFrame = (cb: () => void) =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : setTimeout(cb, 16);

function nothingFocused(): boolean {
  const active = document.activeElement;
  return !active || active === document.body || active === document.documentElement || !active.isConnected;
}

/**
 * Focus sur le titre de la page (`#contenu-principal h1`) si rien n'a le
 * focus, sans faire défiler : si l'élément d'origine a disparu (ligne
 * supprimée), on ne renvoie pas l'utilisateur en haut de page. Attend le titre
 * d'une page encore en chargement.
 *
 * Aussi pour une fenêtre fermée par une navigation (recherche globale, tiroir
 * de menu) : le `Layout` ne focalise pas le titre tant que le focus est encore
 * dans la fenêtre qui s'efface, c'est donc à elle de le faire en partant.
 */
export function focusPageHeading(started = Date.now()): void {
  if (typeof document === 'undefined' || !nothingFocused()) return;
  const heading = document.querySelector<HTMLElement>(MAIN_HEADING);
  if (heading) {
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
    return;
  }
  if (Date.now() - started < HEADING_WAIT_MS) nextFrame(() => focusPageHeading(started));
}

/**
 * Rend le focus à `opener` s'il existe encore, sinon à la fenêtre restée
 * ouverte en dessous (fenêtres imbriquées), sinon au titre de la page. Ne fait
 * rien si le focus a déjà été placé ailleurs (titre d'une nouvelle page après
 * navigation, champ choisi par la page).
 */
export function returnFocus(opener: HTMLElement | null): void {
  if (typeof document === 'undefined' || !nothingFocused()) return;
  if (opener && opener.isConnected) {
    opener.focus();
    if (document.activeElement === opener) return;
  }
  const openDialogs = document.querySelectorAll<HTMLElement>(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
  );
  const below = openDialogs[openDialogs.length - 1];
  if (below) {
    below.focus();
    if (document.activeElement && below.contains(document.activeElement)) return;
  }
  focusPageHeading();
}

/**
 * Branche le retour du focus sur un `DialogPrimitive.Content` :
 *
 *   const focusReturn = useFocusReturn(onCloseAutoFocus);
 *   <DialogPrimitive.Content onCloseAutoFocus={focusReturn.onCloseAutoFocus}>
 *     <FocusReturnCapture opener={focusReturn.opener} />   // ui/dialog
 *     …
 *
 * Le gestionnaire de l'appelant passe d'abord : s'il appelle
 * `event.preventDefault()` (« la page a navigué, le Layout focalise le titre »),
 * le focus n'est pas rendu.
 */
export function useFocusReturn(onCloseAutoFocus?: (event: Event) => void) {
  const opener = React.useRef<HTMLElement | null>(null);
  const handleCloseAutoFocus = React.useCallback(
    (event: Event) => {
      onCloseAutoFocus?.(event);
      if (event.defaultPrevented) return;
      // Sans déclencheur, Radix enverrait le focus sur `<body>`.
      event.preventDefault();
      returnFocus(opener.current);
    },
    [onCloseAutoFocus]
  );
  return { opener, onCloseAutoFocus: handleCloseAutoFocus };
}

/**
 * Mémorise l'élément d'origine. À appeler dans un composant monté avec le
 * contenu de la fenêtre (donc à chaque ouverture) : son premier rendu précède
 * tout déplacement du focus (`autoFocus`, piège de focus Radix).
 */
export function useCaptureOpener(opener: React.MutableRefObject<HTMLElement | null>): void {
  const [captured] = React.useState(() =>
    typeof document === 'undefined' ? null : resolveOpener(document.activeElement)
  );
  React.useLayoutEffect(() => {
    opener.current = captured;
  }, [captured, opener]);
}
