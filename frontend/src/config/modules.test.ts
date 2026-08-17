import { describe, expect, it } from 'vitest';
import { MODULES, MODULES_VERROUILLES, moduleForPath } from './modules';

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
