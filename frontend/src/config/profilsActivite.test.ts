import { describe, it, expect } from 'vitest';
import { differeDuProfil, modulesDuProfil, profilActivite, PROFILS_ACTIVITE } from './profilsActivite';
import { MODULES, MODULES_VERROUILLES } from './modules';
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
    expect(modulesDuProfil('general')).toEqual([]);
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
