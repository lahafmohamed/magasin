import { describe, expect, it } from 'vitest';
import { balanceDirection, ledgerSourceHref, tiersMovementHref, tiersMovementLabel, tiersMovementOpenLabel } from './ledger';

describe('ledgerSourceHref', () => {
  it('links customer invoices to their detail page', () => {
    expect(ledgerSourceHref({ source_type: 'facture', source_id: 42 })).toBe('/factures/42');
  });

  it('does not invent links for unsupported or incomplete source types', () => {
    expect(ledgerSourceHref({ source_type: 'facture_fournisseur', source_id: 7 })).toBeNull();
    expect(ledgerSourceHref({ source_type: 'facture', source_id: null })).toBeNull();
    expect(ledgerSourceHref({ source_type: 'caisse_mouvement', source_id: 3 })).toBeNull();
  });
});

describe('tiersMovementHref', () => {
  it('links client invoices and credit notes to their detail page', () => {
    expect(tiersMovementHref({ type: 'facture_client', document_id: 12 })).toBe('/factures/12');
    expect(tiersMovementHref({ type: 'avoir_client', document_id: 3 })).toBe('/avoirs/3');
  });

  it('gives no link when the document has no detail page', () => {
    expect(tiersMovementHref({ type: 'facture_fourn', document_id: 5 })).toBeNull();
    expect(tiersMovementHref({ type: 'paiement_client', document_id: 9 })).toBeNull();
    expect(tiersMovementHref({ type: 'facture_client', document_id: null })).toBeNull();
  });
});

describe('tiersMovementLabel', () => {
  it('spells every movement type in full, without abbreviations', () => {
    expect(tiersMovementLabel('facture_fourn')).toBe('Facture fournisseur');
    expect(tiersMovementLabel('paiement_fourn')).toBe('Paiement fournisseur');
    expect(tiersMovementLabel('acompte_client')).toBe('Acompte reçu');
  });

  it('never shows a raw code for an unknown type', () => {
    expect(tiersMovementLabel('ajustement_manuel')).toBe('Ajustement manuel');
    expect(tiersMovementLabel(undefined)).toBe('Mouvement');
  });
});

describe('tiersMovementOpenLabel (CPG-N3)', () => {
  it('names the link with the document and its article', () => {
    expect(tiersMovementOpenLabel('facture_client', 'FAC-2026-00010')).toBe('Ouvrir la facture FAC-2026-00010');
    expect(tiersMovementOpenLabel('avoir_client', 'AVOIR-2026-00004')).toBe('Ouvrir l’avoir AVOIR-2026-00004');
    expect(tiersMovementOpenLabel('inconnu', 'X-1')).toBe('Ouvrir la pièce X-1');
  });
});

describe('balanceDirection', () => {
  it('reads a positive client balance as money the contact owes you', () => {
    expect(balanceDirection(484225, 'client')).toEqual({ amount: 484225, direction: 'receivable', label: 'Il vous doit' });
    expect(balanceDirection('484225.00', 'net')).toEqual({ amount: 484225, direction: 'receivable', label: 'Il vous doit' });
  });

  it('reads a positive supplier balance as money you owe', () => {
    expect(balanceDirection(150000, 'fournisseur')).toEqual({ amount: 150000, direction: 'payable', label: 'Vous lui devez' });
  });

  it('turns negative balances around and shows the amount without a sign', () => {
    expect(balanceDirection(-20000, 'client')).toEqual({ amount: 20000, direction: 'payable', label: 'Vous lui devez' });
    expect(balanceDirection(-20000, 'fournisseur')).toEqual({ amount: 20000, direction: 'receivable', label: 'Il vous doit' });
  });

  it('treats zero, rounding leftovers and missing values as settled', () => {
    expect(balanceDirection(0, 'client').label).toBe('Compte soldé');
    expect(balanceDirection(0.4, 'net').direction).toBe('settled');
    expect(balanceDirection(null, 'fournisseur').direction).toBe('settled');
  });
});
