import { describe, expect, it } from 'vitest';
import {
  APP_ROUTES,
  canAccessPath,
  findRoute,
  normalizePathname,
  rolesForPath,
  routeLabel,
} from './routeAccess';

describe('carte des accès par route', () => {
  it('déclare chaque route une seule fois', () => {
    const paths = APP_ROUTES.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('retrouve la route d’un chemin concret', () => {
    expect(findRoute('/factures/110')?.path).toBe('/factures/:id');
    expect(findRoute('/devis/7/edit')?.path).toBe('/devis/:id/edit');
    expect(findRoute('/caisse/audit')?.path).toBe('/caisse/audit');
  });

  it('préfère un segment fixe à un paramètre, comme react-router', () => {
    expect(findRoute('/factures/nouvelle')?.path).toBe('/factures/nouvelle');
    expect(findRoute('/demandes/nouvelle')?.path).toBe('/demandes/nouvelle');
  });

  it('ignore la query-string, le fragment et la barre finale', () => {
    expect(normalizePathname('/inventaire?search=INF-001')).toBe('/inventaire');
    expect(normalizePathname('/profil#mot-de-passe')).toBe('/profil');
    expect(findRoute('/factures/?statut=payee')?.path).toBe('/factures');
  });

  it('applique les rôles du backend', () => {
    // Le caissier facture mais ne fait ni devis ni BL (routes `salesDocuments`).
    expect(canAccessPath('/factures', 'caissier')).toBe(true);
    expect(canAccessPath('/factures/nouvelle', 'caissier')).toBe(true);
    expect(canAccessPath('/devis', 'caissier')).toBe(false);
    expect(canAccessPath('/bons-livraison/3', 'caissier')).toBe(false);
    // L'historique des caisses est réservé aux responsables.
    expect(canAccessPath('/caisse', 'caissier')).toBe(true);
    expect(canAccessPath('/caisse/historique', 'caissier')).toBe(false);
    expect(canAccessPath('/caisse/historique', 'manager')).toBe(true);
    // Le dépôt réceptionne et transfère, sans voir les ventes.
    expect(canAccessPath('/receptions', 'depot_staff')).toBe(true);
    expect(canAccessPath('/stock-transfers', 'depot_staff')).toBe(true);
    expect(canAccessPath('/stock-locations', 'depot_staff')).toBe(true);
    expect(canAccessPath('/factures', 'depot_staff')).toBe(false);
    // Administration.
    expect(canAccessPath('/settings', 'manager')).toBe(true);
    expect(canAccessPath('/admin/users', 'manager')).toBe(false);
    expect(canAccessPath('/admin/users', 'admin')).toBe(true);
  });

  it('réserve les demandes aux rôles que l’API laisse les traiter', () => {
    // Le caissier : l'API lui refuse le détail, l'envoi et la modification.
    for (const path of ['/demandes', '/demandes/nouvelle', '/demandes/12', '/demandes/12/edit']) {
      expect(canAccessPath(path, 'caissier')).toBe(false);
    }
    // Le dépôt décide et exécute, mais ne crée ni ne modifie de demande.
    expect(canAccessPath('/demandes', 'depot_staff')).toBe(true);
    expect(canAccessPath('/demandes/12', 'depot_staff')).toBe(true);
    expect(canAccessPath('/demandes/nouvelle', 'depot_staff')).toBe(false);
    expect(canAccessPath('/demandes/12/edit', 'depot_staff')).toBe(false);
    // Le magasin et les responsables font tout le parcours.
    for (const role of ['magasin_staff', 'manager', 'admin']) {
      expect(canAccessPath('/demandes/nouvelle', role)).toBe(true);
      expect(canAccessPath('/demandes/12/edit', role)).toBe(true);
    }
  });

  it('réserve les achats aux responsables : le dépôt ne voit que des quantités (E2)', () => {
    for (const path of ['/commandes', '/commandes/6', '/reapprovisionnement', '/factures-fournisseur']) {
      expect(canAccessPath(path, 'depot_staff'), path).toBe(false);
      expect(canAccessPath(path, 'manager'), path).toBe(true);
      expect(canAccessPath(path, 'admin'), path).toBe(true);
    }
  });

  it('ouvre les pages communes à tout utilisateur connecté', () => {
    for (const role of ['admin', 'manager', 'caissier', 'magasin_staff', 'depot_staff', 'viewer']) {
      expect(canAccessPath('/', role)).toBe(true);
      expect(canAccessPath('/profil', role)).toBe(true);
      expect(canAccessPath('/inventaire', role)).toBe(true);
    }
    expect(rolesForPath('/')).toBeNull();
  });

  it('refuse un chemin inconnu ou un utilisateur sans rôle', () => {
    expect(canAccessPath('/nexiste-pas', 'admin')).toBe(false);
    expect(rolesForPath('/nexiste-pas')).toBeUndefined();
    expect(canAccessPath('/factures', undefined)).toBe(false);
    expect(canAccessPath('/factures', null)).toBe(false);
  });

  it('nomme chaque page en français, sans abréviation de menu', () => {
    expect(routeLabel('/demandes')).toBe('Demandes de réapprovisionnement');
    expect(routeLabel('/reapprovisionnement')).toBe('Suggestions d’achat');
    expect(routeLabel('/factures/12')).toBe('Facture');
    for (const route of APP_ROUTES) {
      expect(route.label.trim().length).toBeGreaterThan(0);
      expect(route.label).not.toMatch(/'/); // apostrophe typographique ’ uniquement
    }
  });
});
