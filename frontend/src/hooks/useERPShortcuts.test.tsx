import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const auth = vi.hoisted(() => ({ role: 'manager' }));
vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: auth.role }, hasRole: (...r: string[]) => r.includes(auth.role) }),
  useOptionalAuth: () => ({ user: { id: 1, role: auth.role }, hasRole: (...r: string[]) => r.includes(auth.role) }),
}));
vi.mock('../lib/ModulesContext', () => ({
  useModules: () => ({ estCheminActif: () => true }),
}));

import { shortcutKeysLabel, useERPShortcuts, useKeyboardShortcuts, type Shortcut } from './useKeyboardShortcuts';

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

function press(key: string) {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

describe('raccourcis globaux — touches du navigateur (U-14)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('ne détourne ni F3, ni F7, ni F10 ; contacts, rapports et réceptions passent par « G puis … »', () => {
    auth.role = 'manager';
    const { result } = renderHook(() => useERPShortcuts(), { wrapper });
    const keys = result.current.shortcuts.map((s) => s.key);
    for (const browserKey of ['F1', 'F3', 'F5', 'F6', 'F7', 'F10']) expect(keys).not.toContain(browserKey);

    const label = (description: string) =>
      result.current.shortcuts.filter((s) => s.description === description).map(shortcutKeysLabel);
    expect(label('Aller aux contacts')).toEqual(['G puis T']);
    expect(label('Aller aux rapports')).toEqual(['G puis R']);
    expect(label('Aller aux réceptions')).toEqual(['G puis E']);
    expect(label('Créer une facture')).toEqual(['G puis N']);
  });

  it('les séquences suivent l’accès du rôle', () => {
    auth.role = 'caissier';
    const { result } = renderHook(() => useERPShortcuts(), { wrapper });
    const descriptions = result.current.shortcuts.map((s) => s.description);
    expect(descriptions).not.toContain('Aller aux rapports');
    expect(descriptions).not.toContain('Aller aux réceptions');
  });
});

describe('séquence « G puis … » et raccourcis de page', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function Handlers({ page, global }: { page: Shortcut[]; global: Shortcut[] }) {
    // Écouteur de page inscrit AVANT l'écouteur global : c'est l'ordre après une navigation.
    function Page() {
      useKeyboardShortcuts(page);
      return null;
    }
    function Global() {
      useKeyboardShortcuts(global);
      return null;
    }
    return (
      <>
        <Page />
        <Global />
      </>
    );
  }

  it('« G puis F » ouvre les factures même quand une liste écoute aussi le clavier', () => {
    const goFactures = vi.fn();
    const goNouvelle = vi.fn();
    const listNew = vi.fn();
    render(
      <Handlers
        page={[{ key: 'n', action: listNew, description: 'Nouveau devis' }]}
        global={[
          { key: 'f', gKey: true, action: goFactures, description: 'Aller aux factures' },
          { key: 'n', gKey: true, action: goNouvelle, description: 'Créer une facture' },
        ]}
      />
    );

    press('g');
    press('f');
    expect(goFactures).toHaveBeenCalledOnce();

    // « G puis N » : la séquence globale, pas le « N » de la liste.
    press('g');
    press('n');
    expect(goNouvelle).toHaveBeenCalledOnce();
    expect(listNew).not.toHaveBeenCalled();

    // « N » seul reste le raccourci de la liste.
    press('n');
    expect(listNew).toHaveBeenCalledOnce();
  });
});
