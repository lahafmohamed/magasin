import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSalesFormShortcutHelp } from './useSalesFormShortcutHelp';

const auth = vi.hoisted(() => ({ role: 'caissier' }));
vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 3, role: auth.role } }),
  useOptionalAuth: () => ({ user: { id: 3, role: auth.role } }),
}));
vi.mock('../lib/ModulesContext', () => ({
  useModules: () => ({ estCheminActif: () => true }),
}));

describe('useSalesFormShortcutHelp (P-M5)', () => {
  it('documents Ctrl + Entrée for a role that fills sales forms', () => {
    auth.role = 'caissier';
    const { result } = renderHook(() => useSalesFormShortcutHelp());
    expect(result.current).toEqual([
      { description: 'Dans un formulaire de vente : enregistrer le document', keys: 'Ctrl + Entrée' },
    ]);
  });

  it('says nothing to a role without sales forms', () => {
    auth.role = 'depot_staff';
    const { result } = renderHook(() => useSalesFormShortcutHelp());
    expect(result.current).toEqual([]);
  });
});
