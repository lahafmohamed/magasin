import { useSyncExternalStore } from 'react';

/**
 * Préférence « raccourcis à une touche » (WCAG 2.1.4).
 *
 * Les raccourcis sans modificateur (« / », « n », « G puis F », « E » en
 * caisse…) se déclenchent quand un logiciel de dictée ou un doigt qui glisse
 * tape la lettre. L'utilisateur doit pouvoir les couper. Préférence par
 * utilisateur (poste partagé au comptoir), activée par défaut, et lue sans
 * contexte React pour que n'importe quel gestionnaire clavier puisse la
 * consulter (`CaisseV2` a le sien).
 *
 * Le stockage peut être indisponible (navigation privée, quotas) : toute
 * lecture/écriture passe par try/catch et retombe sur « activé ».
 */

const STORAGE_KEY = 'raccourcis-une-touche';
const listeners = new Set<() => void>();

function cachedUserId(): string | null {
  try {
    const raw = localStorage.getItem('auth_user');
    if (!raw) return null;
    const id = (JSON.parse(raw) as { id?: unknown })?.id;
    return typeof id === 'number' || typeof id === 'string' ? String(id) : null;
  } catch {
    return null;
  }
}

function storageKey(): string {
  const id = cachedUserId();
  return id ? `${STORAGE_KEY}:${id}` : STORAGE_KEY;
}

/** Les raccourcis à une touche sont-ils actifs pour l'utilisateur courant ? */
export function areSingleKeyShortcutsEnabled(): boolean {
  try {
    return localStorage.getItem(storageKey()) !== '0';
  } catch {
    return true;
  }
}

export function setSingleKeyShortcutsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(storageKey(), enabled ? '1' : '0');
  } catch {
    /* stockage indisponible : la préférence ne survivra pas au rechargement */
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  // Un autre onglet a changé la préférence.
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key.startsWith(STORAGE_KEY)) notify();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Préférence réactive, pour un interrupteur dans l'interface.
 *
 *   const [enabled, setEnabled] = useSingleKeyShortcuts();
 *   <Checkbox checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
 */
export function useSingleKeyShortcuts(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, areSingleKeyShortcutsEnabled, () => true);
  return [enabled, setSingleKeyShortcutsEnabled];
}

const INTERACTIVE_TARGET =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], ' +
  '[role="combobox"], [role="listbox"], [role="option"], [role="menu"], [role="menuitem"], ' +
  '[role="menuitemradio"], [role="menuitemcheckbox"], [role="textbox"], [role="spinbutton"], ' +
  '[role="slider"], [role="radiogroup"], button[aria-haspopup]';

/**
 * La touche a-t-elle été frappée dans un contrôle qui l'utilise lui-même
 * (champ, liste déroulante, menu, sélecteur Radix) ? Un « e » tapé sur un
 * déclencheur de `Select` ouvrait la fenêtre « Entrée » de la caisse.
 */
export function isShortcutBlockedByTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return target.closest(INTERACTIVE_TARGET) !== null;
}

/**
 * Un raccourci à une touche peut-il s'exécuter pour cet événement ?
 * Faux quand la préférence est coupée, quand la frappe vise un contrôle de
 * saisie ou quand une fenêtre modale a le focus.
 */
export function canRunSingleKeyShortcut(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (!areSingleKeyShortcutsEnabled()) return false;
  if (isShortcutBlockedByTarget(event.target)) return false;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('[role="dialog"], [role="alertdialog"]')) return false;
  return true;
}
