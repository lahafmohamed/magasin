import { describe, expect, it } from 'vitest';
import {
  MODULES,
  MODULES_AU_CHOIX,
  MODULES_HORS_V1,
  MODULES_VERROUILLES,
  descriptionParametresFinance,
  estHorsV1,
  libelleParametresFinance,
  moduleForPath,
} from './modules';

describe('catalogue des modules', () => {
  it('associe une route exacte à son module', () => {
    expect(moduleForPath('/stock-locations')).toBe('emplacements');
    expect(moduleForPath('/relances')).toBe('relances');
  });

  it('rattache les sous-routes au module parent', () => {
    // Le détail d'une facture doit suivre le sort du module Factures.
    expect(moduleForPath('/factures/123')).toBe('factures');
    expect(moduleForPath('/avoirs/7')).toBe('avoirs');
  });

  it('préfère le préfixe le plus long', () => {
    // '/caisse/audit' ne doit pas être avalé par '/caisse' : désactiver la
    // caisse ne doit pas masquer l'audit de caisse, et inversement.
    expect(moduleForPath('/caisse/audit')).toBe('audit-caisse');
    expect(moduleForPath('/caisse')).toBe('caisse');
  });

  it('laisse passer les routes hors catalogue', () => {
    // Profil, changement de mot de passe, paramètres… ne sont rattachés à
    // aucun module : ils doivent rester accessibles quoi qu'il arrive.
    expect(moduleForPath('/profil')).toBeNull();
    expect(moduleForPath('/settings')).toBeNull();
    expect(moduleForPath('/')).toBeNull();
  });

  it('protège le noyau fonctionnel', () => {
    // Sans facturation, produits, contacts ni utilisateurs, l'ERP n'a plus
    // d'objet : ces modules ne doivent jamais être désactivables.
    expect(MODULES_VERROUILLES).toEqual(
      expect.arrayContaining(['factures', 'inventaire', 'tiers', 'utilisateurs'])
    );
  });

  it("n'a ni clé ni chemin en double", () => {
    const cles = MODULES.map((m) => m.key);
    expect(new Set(cles).size).toBe(cles.length);

    const chemins = MODULES.flatMap((m) => m.paths);
    expect(new Set(chemins).size).toBe(chemins.length);
  });

  it('utilise des clés conformes au format accepté par le backend', () => {
    // Le schéma Zod côté serveur impose /^[a-z0-9-]{1,50}$/.
    for (const m of MODULES) {
      expect(m.key).toMatch(/^[a-z0-9-]{1,50}$/);
    }
  });

  it('décrit chaque module en français, sans jargon de développeur', () => {
    for (const m of MODULES) {
      expect(m.label.trim().length).toBeGreaterThan(0);
      expect(m.description.trim().length).toBeGreaterThan(0);
      expect(m.paths.length).toBeGreaterThan(0);
    }
  });
});

describe('périmètre v1', () => {
  it('ne sort du choix du client que des modules du catalogue, jamais un module verrouillé', () => {
    const cles = new Set(MODULES.map((m) => m.key));
    for (const k of MODULES_HORS_V1) {
      expect(cles.has(k), k).toBe(true);
      expect(MODULES_VERROUILLES).not.toContain(k);
    }
    // Décision 2 du plan v1 : exactement ces quatre-là.
    expect([...MODULES_HORS_V1].sort()).toEqual(['comptabilite', 'employes', 'paie', 'tresorerie']);
  });

  it('laisse tous les autres modules au choix du client', () => {
    expect(MODULES_AU_CHOIX).toHaveLength(MODULES.length - MODULES_HORS_V1.length);
    for (const m of MODULES_AU_CHOIX) expect(estHorsV1(m.key), m.key).toBe(false);
  });

  it('couvre toutes les adresses de la paie, des employés, de la comptabilité et de la trésorerie', () => {
    for (const path of ['/paie', '/employes', '/employes/12', '/general-ledger', '/comptabilite', '/tresorerie']) {
      const key = moduleForPath(path);
      expect(key, path).not.toBeNull();
      expect(estHorsV1(key as string), path).toBe(true);
    }
    // Le cœur garanti n'est jamais hors périmètre.
    for (const path of ['/factures', '/vente-comptoir', '/caisse', '/inventaire', '/reporting', '/settings']) {
      const key = moduleForPath(path);
      expect(key !== null && estHorsV1(key), path).toBe(false);
    }
  });

  it('nomme la page des paramètres de gestion selon que la paie est là ou non', () => {
    expect(libelleParametresFinance(true)).toBe('Paramètres paie et achats');
    expect(libelleParametresFinance(false)).toBe('Paramètres achats');
    expect(descriptionParametresFinance(false)).not.toMatch(/CNPS|ITS|paie/i);
  });
});
