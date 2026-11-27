import { describe, expect, it } from 'vitest';
import { buildNavCategories, GROUP_ORDER } from './navConfig';
import { canAccessPath, type AppRole } from '../config/routeAccess';
import { MODULES_HORS_V1, moduleForPath } from '../config/modules';
import { PROFILS_ACTIVITE, modulesDuProfil } from '../config/profilsActivite';

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

/**
 * Phase 1 du plan v1 : sur une instance neuve, quel que soit le profil métier
 * choisi puis appliqué, le menu ne propose ni la paie, ni les employés, ni la
 * comptabilité, ni la trésorerie — à aucun rôle.
 */
describe('périmètre v1 — menu d’une instance neuve, par profil métier', () => {
  const HORS_V1_PATHS = ['/paie', '/employes', '/general-ledger', '/tresorerie'];

  /** Menu d'un rôle une fois le préréglage du profil appliqué sur une instance neuve. */
  function menu(profil: (typeof PROFILS_ACTIVITE)[number]['value'], role: AppRole) {
    const masques = new Set(modulesDuProfil(profil, MODULES_HORS_V1));
    return buildNavCategories(
      role,
      (path) => {
        const key = moduleForPath(path);
        return !key || !masques.has(key);
      },
      (key) => !masques.has(key)
    );
  }
  const chemins = (profil: (typeof PROFILS_ACTIVITE)[number]['value'], role: AppRole) =>
    menu(profil, role).flatMap((c) => c.items.map((i) => i.path));

  it.each(PROFILS_ACTIVITE.map((p) => [p.label, p.value] as const))(
    '%s : ni paie, ni employés, ni comptabilité, ni trésorerie, pour aucun rôle',
    (_label, value) => {
      for (const role of ROLES) {
        for (const path of HORS_V1_PATHS) {
          expect(chemins(value, role), `${role} → ${path}`).not.toContain(path);
        }
      }
    }
  );

  it.each(PROFILS_ACTIVITE.map((p) => [p.label, p.value] as const))(
    '%s : la rubrique « Équipe » disparaît et « Gestion » garde les rapports',
    (_label, value) => {
      const cats = menu(value, 'admin');
      expect(cats.map((c) => c.id)).not.toContain('equipe');
      expect(cats.find((c) => c.id === 'gestion')?.items.map((i) => i.path)).toEqual(
        expect.arrayContaining(['/reporting', '/stock-valuation'])
      );
    }
  );

  it.each(PROFILS_ACTIVITE.map((p) => [p.label, p.value] as const))(
    '%s : la page des paramètres de gestion ne parle plus de paie',
    (_label, value) => {
      const libelles = menu(value, 'admin').flatMap((c) => c.items.map((i) => i.label));
      expect(libelles).toContain('Paramètres achats');
      expect(libelles).not.toContain('Paramètres paie et achats');
      for (const l of libelles) expect(l).not.toMatch(/paie|comptabilité|trésorerie|employés/i);
    }
  );

  it.each(PROFILS_ACTIVITE.map((p) => [p.label, p.value, p.venteParDefaut, p.masques] as const))(
    '%s : le cœur de vente reste au menu, les modules du préréglage en sortent',
    (_label, value, venteParDefaut, masques) => {
      for (const role of ['admin', 'manager', 'magasin_staff', 'caissier'] as const) {
        const liste = chemins(value, role);
        // Cœur garanti, jamais masqué par un profil.
        expect(liste, `${role} → /factures`).toContain('/factures');
        expect(liste, `${role} → /caisse`).toContain('/caisse');
        expect(liste, `${role} → /inventaire`).toContain('/inventaire');
        if (venteParDefaut === '/vente-comptoir') expect(liste, role).toContain('/vente-comptoir');
        if (masques.includes('devis')) expect(liste, `${role} → /devis`).not.toContain('/devis');
      }
      // Sans préréglage restrictif, le vendeur garde devis et bons de livraison.
      if (masques.length === 0) {
        expect(chemins(value, 'magasin_staff')).toEqual(expect.arrayContaining(['/devis', '/bons-livraison']));
      }
    }
  );

  it('quand l’éditeur active la paie, le libellé complet revient', () => {
    const libelles = buildNavCategories('admin').flatMap((c) => c.items.map((i) => i.label));
    expect(libelles).toContain('Paramètres paie et achats');
    expect(libelles).toContain('Paie');
  });
});
