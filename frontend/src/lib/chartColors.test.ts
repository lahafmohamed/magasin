import { describe, expect, it } from 'vitest';
import { chartMoneyTooltip, chartPercentTooltip } from './chartColors';
import { avoirTypeHue } from '@/utils/avoirTypes';

const plain = (s: string) => s.replace(/[\u00A0\u202F]/g, ' ');

describe('infobulles recharts', () => {
  it('montant : nombre, chaîne NUMERIC, plage et valeur absente', () => {
    expect(plain(chartMoneyTooltip(1234500))).toBe('1 234 500 FCFA');
    expect(plain(chartMoneyTooltip('85000.00'))).toBe('85 000 FCFA');
    expect(plain(chartMoneyTooltip([1000, 2500]))).toBe('1 000 FCFA – 2 500 FCFA');
    // Jamais « 0 FCFA » pour une valeur manquante.
    expect(chartMoneyTooltip(undefined)).toBe('—');
  });

  it('pourcentage : virgule décimale et espace avant %', () => {
    expect(plain(chartPercentTooltip(23.36))).toBe('23,4 %');
    expect(chartPercentTooltip(null)).toBe('—');
  });
});

describe('motifs d’avoir', () => {
  it('une teinte par motif, la même dans la liste et le formulaire', () => {
    expect(avoirTypeHue('retour')).toBe(1);
    // chart-2 et non chart-3 : les pastilles chart-1 et chart-3 se confondaient.
    expect(avoirTypeHue('remise_commerciale')).toBe(2);
    expect(new Set(['retour', 'echange', 'remise_commerciale', 'erreur'].map(avoirTypeHue)).size).toBe(4);
    expect(avoirTypeHue('inconnu')).toBeUndefined();
    expect(avoirTypeHue(null)).toBeUndefined();
  });
});
