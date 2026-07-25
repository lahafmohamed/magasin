import { describe, expect, it } from 'vitest';
import { ledgerSourceHref } from './ledger';

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
