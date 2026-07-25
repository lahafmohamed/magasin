import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  connect: vi.fn(),
  checkPeriodIsOpen: vi.fn(),
  recomputeClientAllocations: vi.fn(),
  allocateAvailableAdvances: vi.fn(),
}));

vi.mock('../db/connection', () => ({
  default: { connect: mocks.connect },
}));

vi.mock('./PeriodService', () => ({
  checkPeriodIsOpen: mocks.checkPeriodIsOpen,
}));

vi.mock('./ClientAllocationService', () => ({
  ClientAllocationService: {
    recomputeClientAllocations: mocks.recomputeClientAllocations,
  },
}));

vi.mock('./SupplierAllocationService', () => ({
  SupplierAllocationService: {
    allocateAvailableAdvances: mocks.allocateAvailableAdvances,
  },
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

import { CompensationService } from './CompensationService';

describe('CompensationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
    mocks.checkPeriodIsOpen.mockResolvedValue(undefined);
    mocks.recomputeClientAllocations.mockResolvedValue({});
    mocks.allocateAvailableAdvances.mockResolvedValue({});
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM tiers WHERE')) {
        return {
          rows: [{
            id: 12,
            raison_sociale: 'Tiers mixte',
            est_client: true,
            est_fournisseur: true,
            solde_client: '100000',
            solde_fourn: '335000',
          }],
        };
      }
      if (sql.includes('FROM plan_comptable')) {
        return { rows: [{ numero: '401' }, { numero: '411' }] };
      }
      if (sql.includes('INSERT INTO ecritures_comptables')) {
        return { rows: [{ id: 501 }, { id: 502 }] };
      }
      if (sql.includes('INSERT INTO compensations')) {
        return { rows: [{ id: 77, tiers_id: 12, montant: '100000' }] };
      }
      return { rows: [] };
    });
  });

  it('creates symmetric client and supplier acompte rows', async () => {
    await CompensationService.create({
      tiers_id: 12,
      date_compensation: '2026-07-20',
      montant: 100000,
      cree_par: 1,
    });

    const sqlCalls = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(sqlCalls.some((sql) => sql.includes('INSERT INTO acomptes_clients'))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes('INSERT INTO acomptes_fournisseur'))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes('SAVEPOINT sp_acompte_link'))).toBe(false);
    expect(mocks.recomputeClientAllocations).toHaveBeenCalledWith(12);
    expect(mocks.allocateAvailableAdvances).toHaveBeenCalledWith(12, {
      transaction: expect.any(Object),
      userId: 1,
    });
  });
});
