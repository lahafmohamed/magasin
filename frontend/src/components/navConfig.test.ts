import { describe, expect, it } from 'vitest';
import { buildNavCategories, GROUP_ORDER } from './navConfig';
import { canAccessPath, type AppRole } from '../config/routeAccess';

const ROLES: AppRole[] = ['admin', 'manager', 'caissier', 'magasin_staff', 'depot_staff', 'viewer'];

const paths = (role: AppRole) => buildNavCategories(role).flatMap((c) => c.items.map((i) => i.path));
const labels = (role: AppRole) => buildNavCategories(role).flatMap((c) => c.items.map((i) => i.label));

describe('menu par rôle', () => {
  it('ne propose que des pages que le rôle peut ouvrir', () => {
    for (const role of ROLES) {
      for (const path of paths(role)) {
        expect(canAccessPath(path, role), `${role} → ${path}`).toBe(true);
      }
    }
  });

  it('ne répète aucune entrée', () => {
    for (const role of ROLES) {
      const list = paths(role);
      expect(new Set(list).size, role).toBe(list.length);
    }
  });

  it('ordonne les rubriques selon le premier métier du rôle', () => {
    expect(buildNavCategories('caissier').map((c) => c.id)).toEqual(['caisse', 'ventes', 'stock']);
    expect(buildNavCategories('magasin_staff').map((c) => c.id)).toEqual(['ventes', 'caisse', 'stock']);
    expect(buildNavCategories('depot_staff').map((c) => c.id)).toEqual(['stock']);
    expect(buildNavCategories('manager').map((c) => c.id)).toEqual([...GROUP_ORDER.manager]);
    expect(buildNavCategories('manager')[0].id).toBe('ventes');
  });

  it('montre au caissier sa caisse et ses factures, sans impasse', () => {
    const p = paths('caissier');
    expect(p).toEqual(expect.arrayContaining(['/caisse', '/depenses', '/factures', '/inventaire']));
    // Devis et BL : routes refusées au caissier ; Demandes : il ne peut pas les envoyer.
    expect(p).not.toContain('/devis');
    expect(p).not.toContain('/bons-livraison');
    expect(p).not.toContain('/demandes');
    expect(p).not.toContain('/caisse/historique');
  });

  it('range toutes les tâches du dépôt sous Stock, sans les achats (E2)', () => {
    const p = paths('depot_staff');
    expect(p).toEqual(
      expect.arrayContaining(['/inventaire', '/demandes', '/receptions', '/stock-transfers', '/stock-locations'])
    );
    // Commandes, suggestions d'achat et factures fournisseur : des montants.
    expect(p).not.toContain('/commandes');
    expect(p).not.toContain('/reapprovisionnement');
    expect(p).not.toContain('/factures-fournisseur');
    expect(p).not.toContain('/factures');
  });

  it('donne au gérant l’historique des caisses et la paie sous « Équipe »', () => {
    const cats = buildNavCategories('manager');
    expect(paths('manager')).toContain('/caisse/historique');
    expect(cats.find((c) => c.id === 'equipe')?.items.map((i) => i.path)).toEqual(['/employes', '/paie']);
    expect(cats.find((c) => c.id === 'contacts')?.items.map((i) => i.path)).not.toContain('/paie');
    // Réservé à l'administrateur.
    expect(paths('manager')).not.toContain('/admin/users');
    expect(paths('admin')).toContain('/admin/users');
  });

  it('emploie les libellés du glossaire', () => {
    expect(labels('admin')).toEqual(
      expect.arrayContaining([
        'Demandes',
        'Suggestions d’achat',
        'Bons de livraison',
        'Commandes fournisseur',
        'Factures fournisseur',
        'Historique des caisses',
        'Paramètres de l’entreprise',
        'Journal d’audit',
      ])
    );
    expect(buildNavCategories('admin').map((c) => c.label)).toEqual([
      'Ventes',
      'Caisse',
      'Stock',
      'Achats',
      'Contacts',
      'Équipe',
      'Gestion',
      'Administration',
    ]);
  });

  it('retire les modules désactivés, puis les rubriques vidées', () => {
    const sansDevis = buildNavCategories('magasin_staff', (path) => path !== '/devis');
    expect(sansDevis.flatMap((c) => c.items.map((i) => i.path))).not.toContain('/devis');
    // La vente comptoir est rangée sous Caisse : seule, elle garde la rubrique.
    const comptoirSeul = buildNavCategories('caissier', (path) => !['/caisse', '/depenses'].includes(path));
    expect(comptoirSeul.find((c) => c.id === 'caisse')?.items.map((i) => i.path)).toEqual(['/vente-comptoir']);
    const sansCaisse = buildNavCategories('caissier', (path) => !['/vente-comptoir', '/caisse', '/depenses'].includes(path));
    expect(sansCaisse.map((c) => c.id)).not.toContain('caisse');
  });

  it('ne construit aucun menu sans rôle', () => {
    expect(buildNavCategories(undefined)).toEqual([]);
  });
});
