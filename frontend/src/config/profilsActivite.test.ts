import { describe, it, expect } from 'vitest';
import { differeDuProfil, modulesDuProfil, profilActivite, PROFILS_ACTIVITE } from './profilsActivite';
import { MODULES, MODULES_HORS_V1, MODULES_VERROUILLES, estHorsV1 } from './modules';
import { montantsProposes } from '../utils/caisseComptoir';

describe('profils métier', () => {
  it('ne masquent que des modules du catalogue, jamais un module verrouillé', () => {
    const cles = new Set(MODULES.map((m) => m.key));
    for (const p of PROFILS_ACTIVITE) {
      for (const k of p.masques) {
        expect(cles.has(k), `${p.value} → ${k}`).toBe(true);
        expect(MODULES_VERROUILLES).not.toContain(k);
      }
    }
  });

  it('gardent la vente comptoir et la caisse pour les métiers de comptoir', () => {
    for (const value of ['habillement', 'libre_service'] as const) {
      const p = profilActivite(value);
      expect(p.venteParDefaut).toBe('/vente-comptoir');
      expect(p.masques).not.toContain('vente-comptoir');
      expect(p.masques).not.toContain('caisse');
    }
  });

  it('retombe sur « Commerce général » pour une valeur inconnue', () => {
    expect(profilActivite('boulangerie').value).toBe('general');
    expect(profilActivite(null).value).toBe('general');
  });

  it('détecte un menu qui ne suit pas le préréglage, sans tenir compte de l’ordre', () => {
    expect(differeDuProfil('habillement', ['relances', 'devis', 'bons-livraison'])).toBe(false);
    expect(differeDuProfil('habillement', ['devis'])).toBe(true);
    expect(differeDuProfil('general', [])).toBe(false);
    // Sur une instance neuve, « Commerce général » ne masque que le hors-v1.
    expect(modulesDuProfil('general')).toEqual([...MODULES_HORS_V1]);
    // Sur une instance où l'éditeur a tout activé, il ne masque rien.
    expect(modulesDuProfil('general', [])).toEqual([]);
  });
});

describe('profils métier et périmètre v1', () => {
  it('aucun préréglage ne décide lui-même d’un module hors périmètre v1', () => {
    for (const p of PROFILS_ACTIVITE) {
      for (const k of p.masques) expect(estHorsV1(k), `${p.value} → ${k}`).toBe(false);
    }
  });

  it.each(PROFILS_ACTIVITE.map((p) => [p.label, p.value] as const))(
    '%s : sur une instance neuve, paie, employés, comptabilité et trésorerie restent masqués',
    (_label, value) => {
      const liste = modulesDuProfil(value, MODULES_HORS_V1);
      for (const k of MODULES_HORS_V1) expect(liste, k).toContain(k);
      // … et l'instance n'est pas signalée « ne suit pas le préréglage ».
      expect(differeDuProfil(value, liste)).toBe(false);
      // Rien en double : la liste sert de test d'appartenance.
      expect(new Set(liste).size).toBe(liste.length);
    }
  );

  it('appliquer « Commerce général » ne réaffiche pas le hors-v1, mais réaffiche le reste', () => {
    const avant = [...MODULES_HORS_V1, 'devis', 'relances'];
    expect(differeDuProfil('general', avant)).toBe(true);
    expect(modulesDuProfil('general', avant).sort()).toEqual([...MODULES_HORS_V1].sort());
  });

  it('une instance neuve suit son profil sans rien toucher', () => {
    expect(differeDuProfil('general', MODULES_HORS_V1)).toBe(false);
    expect(differeDuProfil('informatique', MODULES_HORS_V1)).toBe(false);
    // Habillement masque devis, bons de livraison et relances : pas encore appliqué.
    expect(differeDuProfil('habillement', MODULES_HORS_V1)).toBe(true);
  });

  it('ne masque pas une option que l’éditeur a activée pour ce client', () => {
    // La paie a été activée : sa clé n'est plus dans la liste d'exclusion.
    const avecPaie = ['employes', 'comptabilite', 'tresorerie'];
    const apres = modulesDuProfil('habillement', avecPaie);
    expect(apres).not.toContain('paie');
    expect(apres.sort()).toEqual(['bons-livraison', 'comptabilite', 'devis', 'employes', 'relances', 'tresorerie']);
    expect(differeDuProfil('habillement', apres)).toBe(false);
  });
});

describe('montantsProposes', () => {
  it('propose le compte juste puis les coupures au-dessus', () => {
    expect(montantsProposes(7500)).toEqual([7500, 8000, 10000]);
    expect(montantsProposes(2500)).toEqual([2500, 3000, 4000, 5000]);
    expect(montantsProposes(10000)).toEqual([10000]);
    expect(montantsProposes(0)).toEqual([]);
  });
});
