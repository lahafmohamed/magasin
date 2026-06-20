import { useEffect, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface Shortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  gKey?: boolean;
  action: () => void;
  description: string;
}

let gPressed = false;
let gTimeout: ReturnType<typeof setTimeout> | null = null;

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when user is typing in input fields
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.contentEditable === 'true'
    ) {
      return;
    }

    // Handle G+letter sequences
    if (event.key.toLowerCase() === 'g' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      gPressed = true;
      if (gTimeout) clearTimeout(gTimeout);
      gTimeout = setTimeout(() => { gPressed = false; }, 800);
      return;
    }

    if (gPressed) {
      for (const shortcut of shortcuts) {
        if (shortcut.gKey && event.key.toLowerCase() === shortcut.key.toLowerCase()) {
          event.preventDefault();
          event.stopPropagation();
          gPressed = false;
          if (gTimeout) clearTimeout(gTimeout);
          shortcut.action();
          return;
        }
      }
      gPressed = false;
      if (gTimeout) clearTimeout(gTimeout);
    }

    for (const shortcut of shortcuts) {
      if (shortcut.gKey) continue;
      const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
      const ctrlMatches = !!shortcut.ctrlKey === event.ctrlKey;
      const metaMatches = !!shortcut.metaKey === event.metaKey;
      const shiftMatches = !!shortcut.shiftKey === event.shiftKey;
      const altMatches = !!shortcut.altKey === event.altKey;

      if (keyMatches && ctrlMatches && metaMatches && shiftMatches && altMatches) {
        event.preventDefault();
        event.stopPropagation();
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

// Default ERP shortcuts
export function useERPShortcuts() {
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);

  const shortcuts: Shortcut[] = useMemo(() => [
    {
      key: 'F1',
      action: () => navigate('/factures/nouvelle'),
      description: 'Nouvelle facture',
    },
    {
      key: 'F2',
      action: () => navigate('/inventaire'),
      description: 'Inventaire',
    },
    {
      key: 'F3',
      action: () => navigate('/tiers'),
      description: 'Contacts',
    },
    {
      key: 'F5',
      action: () => navigate('/commandes'),
      description: 'Commandes',
    },
    {
      key: 'F6',
      action: () => navigate('/caisse'),
      description: 'Caisse',
    },
    {
      key: 'F7',
      action: () => navigate('/reporting'),
      description: 'Rapports',
    },
    {
      key: 'F9',
      action: () => navigate('/devis/nouveau'),
      description: 'Nouveau devis',
    },
    {
      key: 'F10',
      action: () => navigate('/receptions'),
      description: 'Réceptions',
    },
    {
      key: 'i',
      gKey: true,
      action: () => navigate('/inventaire'),
      description: 'G+I → Inventaire',
    },
    {
      key: 'f',
      gKey: true,
      action: () => navigate('/factures'),
      description: 'G+F → Factures',
    },
    {
      key: 'c',
      gKey: true,
      action: () => navigate('/caisse'),
      description: 'G+C → Caisse',
    },
    {
      key: 'd',
      gKey: true,
      action: () => navigate('/'),
      description: 'G+D → Dashboard',
    },
    {
      key: 's',
      gKey: true,
      action: () => navigate('/settings'),
      description: 'G+S → Paramètres',
    },
    {
      key: '/',
      ctrlKey: true,
      action: () => setHelpOpen(true),
      description: 'Ctrl+/ → Aide raccourcis',
    },
    {
      key: 'h',
      ctrlKey: true,
      action: () => setHelpOpen(true),
      description: 'Ctrl+H → Aide raccourcis',
    },
  ], [navigate]);

  useKeyboardShortcuts(shortcuts);

  return { shortcuts, helpOpen, setHelpOpen };
}
