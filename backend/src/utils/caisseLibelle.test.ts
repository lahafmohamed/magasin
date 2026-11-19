import { describe, expect, it } from 'vitest';
import { mouvementCaisseLibelleParDefaut, mouvementLibelle, paiementAcompteLisible } from './caisseLibelle';

/** CPG2-02 : les paiements pris sur un acompte avant le 2026-10-24 portaient des identifiants internes. */
describe('paiementAcompteLisible', () => {
  it('relit les anciennes références et notes d’acompte sans « # » ni identifiant de facture', () => {
    expect(
      paiementAcompteLisible({ reference: 'ACO-ALLOC-2', notes: 'Affectation automatique acompte #2 sur facture #115' })
    ).toEqual({
      reference: 'Acompte n° 2',
      notes: 'Acompte n° 2 déduit automatiquement (factures les plus anciennes d’abord)',
    });
    expect(paiementAcompteLisible({ reference: 'ACO-APP-7', notes: 'Application acompte #7' })).toEqual({
      reference: 'Acompte n° 7',
      notes: 'Acompte n° 7 appliqué',
    });
  });

  it('laisse intacts les autres paiements', () => {
    const p = { id: 3, reference: 'WAVE-8F3K2Q', notes: 'Règlement Wave du client' };
    expect(paiementAcompteLisible(p)).toBe(p);
    expect(paiementAcompteLisible({ reference: null, notes: null })).toEqual({ reference: null, notes: null });
  });
});

/**
 * CPG2-03 : les libellés de caisse lisibles par la caissière — tiret
 * cadratin comme le reste de la caisse, jamais un code brut de catégorie.
 */
describe('libellés de mouvement de caisse', () => {
  it('sépare le document et le nom par un tiret cadratin', () => {
    expect(mouvementLibelle('Dépense DEP-2026-00009', 'Repas')).toBe('Dépense DEP-2026-00009 — Repas');
    expect(mouvementLibelle('Dépense DEP-2026-00009', '  ')).toBe('Dépense DEP-2026-00009');
  });

  it('écrit la catégorie en mots, jamais son code', () => {
    expect(mouvementCaisseLibelleParDefaut('retrait_banque')).toBe('Mouvement de caisse — dépôt à la banque');
    expect(mouvementCaisseLibelleParDefaut('apport')).toBe('Mouvement de caisse — apport d’espèces');
    expect(mouvementCaisseLibelleParDefaut('code_inconnu')).toBe('Mouvement de caisse');
    expect(mouvementCaisseLibelleParDefaut(null)).toBe('Mouvement de caisse');
  });
});
