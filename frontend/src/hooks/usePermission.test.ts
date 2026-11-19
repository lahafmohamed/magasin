import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePermission, Permissions } from './usePermission';

const auth = vi.hoisted(() => ({ role: 'admin' }));
vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'test', role: auth.role } }),
}));

const can = (role: string, permission: (typeof Permissions)[keyof typeof Permissions]) => {
  auth.role = role;
  return renderHook(() => usePermission()).result.current.hasPermission(permission);
};

describe('usePermission — miroir des routes backend', () => {
  it('ne propose pas de demande au caissier (envoi et détail refusés par l’API)', () => {
    expect(can('caissier', Permissions.DEMANDE_CREATE)).toBe(false);
    expect(can('caissier', Permissions.DEMANDE_SEND)).toBe(false);
    expect(can('magasin_staff', Permissions.DEMANDE_CREATE)).toBe(true);
  });

  it('donne l’annulation d’un transfert aux rôles de `POST /stock-transfers/:id/cancel`', () => {
    for (const role of ['admin', 'manager', 'depot_staff']) {
      expect(can(role, Permissions.TRANSFERT_CANCEL)).toBe(true);
    }
    for (const role of ['magasin_staff', 'caissier', 'viewer']) {
      expect(can(role, Permissions.TRANSFERT_CANCEL)).toBe(false);
    }
  });
});
