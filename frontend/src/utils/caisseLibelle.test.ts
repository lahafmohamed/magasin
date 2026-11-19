import { describe, expect, it } from 'vitest';
import { libelleMouvementLisible } from './caisseLibelle';

/** CPG2-03 : les anciennes lignes de dépense de la caisse, relues dans la forme actuelle. */
describe('libelleMouvementLisible', () => {
  it('remplace le trait d’union par le tiret cadratin du reste de la caisse', () => {
    expect(libelleMouvementLisible('Dépense DEP-2026-00009 - Repas')).toBe('Dépense DEP-2026-00009 — Repas');
    expect(libelleMouvementLisible('Correction dépense DEP-2026-00003 - ancien montant')).toBe(
      'Correction de la dépense DEP-2026-00003 — ancien montant'
    );
    expect(libelleMouvementLisible('Dépense DEP-2026-00003 - montant corrigé')).toBe('Dépense DEP-2026-00003 — montant corrigé');
  });

  it('écrit le mode de paiement en mots, jamais son code', () => {
    expect(libelleMouvementLisible('Annulation caisse - dépense DEP-2026-00004 passée en orange_money')).toBe(
      'Dépense DEP-2026-00004 désormais payée par Orange Money : sortie de caisse annulée'
    );
    expect(libelleMouvementLisible('Dépense DEP-2026-00004 - mode de paiement changé en espèces')).toBe(
      'Dépense DEP-2026-00004 désormais payée en espèces'
    );
    expect(libelleMouvementLisible('Annulation dépense DEP-2026-00005')).toBe('Annulation de la dépense DEP-2026-00005');
  });

  it('rend tel quel un libellé actuel, et rien pour un libellé vide', () => {
    expect(libelleMouvementLisible('Paiement FAC-2026-00113 — COULIBALY Jean-Pierre')).toBe(
      'Paiement FAC-2026-00113 — COULIBALY Jean-Pierre'
    );
    expect(libelleMouvementLisible('  ')).toBeNull();
    expect(libelleMouvementLisible(null)).toBeNull();
  });
});
