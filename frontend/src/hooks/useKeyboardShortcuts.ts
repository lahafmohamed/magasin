import { useEffect, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useModules } from '../lib/ModulesContext';
import { canAccessPath } from '../config/routeAccess';
import { canRunSingleKeyShortcut, isShortcutBlockedByTarget } from '../lib/shortcutPreferences';

export interface Shortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  /** Séquence « G puis <touche> ». */
  gKey?: boolean;
  action: () => void;
  /** Ce que fait le raccourci, en français (« Aller aux factures »). */
  description: string;
  /** Touches telles qu'affichées dans l'aide (« G puis F », « Ctrl + / »). */
  keys?: string;
  /** Page ouverte : le raccourci n'existe que si le rôle peut l'ouvrir. */
  path?: string;
}

/**
 * Raccourci « à une touche » au sens de WCAG 2.1.4 : une lettre, un chiffre ou
 * un signe sans Ctrl/Alt/Cmd. Les touches de fonction n'en sont pas.
 */
export function isSingleKeyShortcut(s: Pick<Shortcut, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'gKey'>): boolean {
  if (s.ctrlKey || s.metaKey || s.altKey) return false;
  return !!s.gKey || s.key.length === 1;
}

/** Libellé des touches pour l'aide : « G puis F », « Ctrl + / », « F2 ». */
export function shortcutKeysLabel(s: Shortcut): string {
  if (s.keys) return s.keys;
  if (s.gKey) return `G puis ${s.key.toUpperCase()}`;
  const parts: string[] = [];
  if (s.ctrlKey) parts.push('Ctrl');
  if (s.metaKey) parts.push('⌘');
  if (s.altKey) parts.push('Alt');
  if (s.shiftKey) parts.push('Maj');
  parts.push(s.key.length === 1 ? s.key.toUpperCase() : s.key);
  return parts.join(' + ');
}

let gPressed = false;
let gTimeout: ReturnType<typeof setTimeout> | null = null;

function resetG() {
  gPressed = false;
  if (gTimeout) clearTimeout(gTimeout);
  gTimeout = null;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Un autre gestionnaire (raccourci global, composant) a déjà traité la touche.
    if (event.defaultPrevented) return;
    // Jamais pendant une saisie, ni sur un contrôle qui exploite lui-même les
    // touches (liste déroulante, menu, combobox).
    if (isShortcutBlockedByTarget(event.target)) return;

    const key = event.key.toLowerCase();

    // Séquences G + lettre : la touche G arme la séquence pendant 800 ms.
    if (key === 'g' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      if (!canRunSingleKeyShortcut(event)) return;
      if (!shortcuts.some((s) => s.gKey)) return;
      gPressed = true;
      if (gTimeout) clearTimeout(gTimeout);
      gTimeout = setTimeout(resetG, 800);
      return;
    }

    if (gPressed) {
      // Une séquence « G puis … » est en cours : elle appartient aux
      // gestionnaires qui en déclarent (raccourcis globaux). Un gestionnaire de
      // page sans séquence ne la désarme pas et ne déclenche pas sa propre
      // touche (« N » d'une liste) — sinon l'ordre d'inscription des écouteurs
      // décidait du résultat et « G puis F » échouait sur les listes.
      if (!shortcuts.some((s) => s.gKey)) return;
      const match = shortcuts.find((s) => s.gKey && key === s.key.toLowerCase());
      if (match && canRunSingleKeyShortcut(event)) {
        event.preventDefault();
        resetG();
        match.action();
        return;
      }
      resetG();
    }

    for (const shortcut of shortcuts) {
      if (shortcut.gKey) continue;
      const keyMatches = key === shortcut.key.toLowerCase();
      const ctrlMatches = !!shortcut.ctrlKey === event.ctrlKey;
      const metaMatches = !!shortcut.metaKey === event.metaKey;
      // Sur un clavier AZERTY, « / » et « ? » s'obtiennent avec Maj : pour un
      // signe (pas une lettre), Maj fait partie du caractère, on l'ignore.
      const ignoreShift = shortcut.key.length === 1 && !/[a-z]/i.test(shortcut.key);
      const shiftMatches = ignoreShift || !!shortcut.shiftKey === event.shiftKey;
      const altMatches = !!shortcut.altKey === event.altKey;

      if (keyMatches && ctrlMatches && metaMatches && shiftMatches && altMatches) {
        if (isSingleKeyShortcut(shortcut) && !canRunSingleKeyShortcut(event)) return;
        event.preventDefault();
        shortcut.action();
        break;
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => handleKeyDown(e);
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleKeyDown]);
}

/** Événement qui ouvre l'aide des raccourcis (menu utilisateur, bouton d'aide). */
export const OPEN_SHORTCUTS_HELP_EVENT = 'raccourcis:aide';

export function openShortcutsHelp(): void {
  window.dispatchEvent(new CustomEvent(OPEN_SHORTCUTS_HELP_EVENT));
}

/**
 * Raccourcis globaux de l'ERP, filtrés par rôle et par module actif.
 *
 * Aucune touche de fonction dont le navigateur a besoin n'est détournée :
 * F1 (aide), F3 (rechercher le suivant), F5 (recharger, réflexe courant sur un
 * réseau instable), F6 (zones du navigateur), F7 (navigation au curseur), F10
 * (barre de menus). Contacts, rapports et réceptions passent par des séquences
 * « G puis … ». Chaque raccourci qui ouvre une page n'est enregistré que si le
 * rôle peut l'ouvrir — plus de raccourci menant à un refus.
 */
export function useERPShortcuts() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { estCheminActif } = useModules();
  const role = user?.role;
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const open = () => setHelpOpen(true);
    window.addEventListener(OPEN_SHORTCUTS_HELP_EVENT, open);
    return () => window.removeEventListener(OPEN_SHORTCUTS_HELP_EVENT, open);
  }, []);

  const shortcuts: Shortcut[] = useMemo(() => {
    const go = (path: string) => () => navigate(path);
    const all: Shortcut[] = [
      { key: 'd', gKey: true, path: '/', action: go('/'), description: 'Aller au tableau de bord' },
      { key: 'f', gKey: true, path: '/factures', action: go('/factures'), description: 'Aller aux factures' },
      { key: 'i', gKey: true, path: '/inventaire', action: go('/inventaire'), description: 'Aller à l’inventaire' },
      { key: 'c', gKey: true, path: '/caisse', action: go('/caisse'), description: 'Aller à la caisse' },
      { key: 't', gKey: true, path: '/tiers', action: go('/tiers'), description: 'Aller aux contacts' },
      { key: 'r', gKey: true, path: '/reporting', action: go('/reporting'), description: 'Aller aux rapports' },
      { key: 'e', gKey: true, path: '/receptions', action: go('/receptions'), description: 'Aller aux réceptions' },
      { key: 'v', gKey: true, path: '/vente-comptoir', action: go('/vente-comptoir'), description: 'Ouvrir la vente comptoir' },
      { key: 'n', gKey: true, path: '/factures/nouvelle', action: go('/factures/nouvelle'), description: 'Créer une facture' },
      { key: 's', gKey: true, path: '/settings', action: go('/settings'), description: 'Ouvrir les paramètres de l’entreprise' },
      { key: 'F2', path: '/inventaire', action: go('/inventaire'), description: 'Aller à l’inventaire' },
      { key: 'F9', path: '/devis/nouveau', action: go('/devis/nouveau'), description: 'Créer un devis' },
      { key: '/', ctrlKey: true, action: () => setHelpOpen(true), description: 'Afficher les raccourcis clavier' },
      { key: 'h', ctrlKey: true, action: () => setHelpOpen(true), description: 'Afficher les raccourcis clavier' },
    ];
    return all.filter((s) => !s.path || (canAccessPath(s.path, role) && estCheminActif(s.path)));
  }, [navigate, role, estCheminActif]);

  useKeyboardShortcuts(shortcuts);

  return { shortcuts, helpOpen, setHelpOpen };
}
