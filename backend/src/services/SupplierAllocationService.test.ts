import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  connect: vi.fn(),
}));

vi.mock('../db/connection', () => ({
  default: { connect: mocks.connect },
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

import { SupplierAllocationService } from './SupplierAllocationService';

describe('SupplierAllocationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM acomptes_fournisseur')) {
        return {
          rows: [{
            id: 207,
            montant_restant: '500000',
            methode_paiement: 'virement',
            date_acompte: '2026-07-20',
            magasin_id: 1,
            cree_par: 3,
          }],
        };
      }
      if (sql.includes('FROM factures_fournisseur')) {
        return {
          rows: [{ id: 35, total: '335000', montant_paye: '0', restant: '335000' }],
        };
      }
      if (sql.includes('INSERT INTO paiements_fournisseur')) {
        return { rows: [{ id: 901 }] };
      }
      return { rows: [] };
    });
  });

  it('affecte en FIFO le dû et conserve le surplus', async () => {
    const result = await SupplierAllocationService.allocateAvailableAdvances(1794);

    expect(result).toEqual({
      tiersId: 1794,
      facturesUpdated: 1,
      totalAllocated: 335000,
      surplus: 165000,
    });

    const paymentCall = mocks.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO paiements_fournisseur'),
    );
    expect(paymentCall?.[1]).toEqual([
      35,
      335000,
      'virement',
      '2026-07-20',
      'ACOF-AUTO-207-35',
      "Affectation automatique de l'acompte fournisseur #207",
      1,
      'acof-auto:207:35',
      3,
    ]);
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO acompte_applications_fournisseur'),
      ),
    ).toBe(true);
    expect(mocks.query).toHaveBeenCalledWith('COMMIT');
  });
});
