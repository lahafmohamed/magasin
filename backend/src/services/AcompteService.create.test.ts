import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  connect: vi.fn(),
  enregistrerMouvement: vi.fn(),
  allocate: vi.fn(),
}));

vi.mock('../db/connection', () => ({
  default: { connect: mocks.connect },
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

vi.mock('./CaisseMagasinService', () => ({
  caisseMagasinService: { enregistrerMouvement: mocks.enregistrerMouvement },
}));

vi.mock('./SupplierAllocationService', () => ({
  SupplierAllocationService: { allocateAvailableAdvances: mocks.allocate },
}));

import { acompteService } from './AcompteService';

const baseInput = {
  tiersId: 7,
  montant: 100000,
  methode_paiement: 'virement' as const,
  userId: 3,
};

describe('AcompteService.createClient / createFournisseur', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
    mocks.allocate.mockResolvedValue({ tiersId: 7, facturesUpdated: 1, totalAllocated: 100000, surplus: 0 });
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM tiers')) return { rows: [{ id: 7, has_role: true }] };
      if (sql.includes('INSERT INTO acomptes_fournisseur')) return { rows: [{ id: 55, tiers_id: 7, montant: '100000' }] };
      if (sql.includes('INSERT INTO acomptes_clients')) return { rows: [{ id: 66, tiers_id: 7, montant: '100000' }] };
      return { rows: [] };
    });
  });

  it('fournisseur : insère, écrit le grand livre tiers, alloue en FIFO, COMMIT', async () => {
    const result = await acompteService.createFournisseur(baseInput);

    expect(result.idempotent).toBe(false);
    expect(result.acompte.id).toBe(55);
    expect(result.allocation?.totalAllocated).toBe(100000);

    const ledgerCall = mocks.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO compte_fournisseur_lignes'),
    );
    expect(ledgerCall?.[1]).toEqual([7, 55, 'ACOF-55', 100000, null, 3]);

    expect(mocks.allocate).toHaveBeenCalledWith(7, expect.objectContaining({ userId: 3 }));
    expect(mocks.query).toHaveBeenCalledWith('COMMIT');
    // virement sans session : pas de mouvement de caisse
    expect(mocks.enregistrerMouvement).not.toHaveBeenCalled();
  });

  it('client : écrit le grand livre client en crédit et ne déclenche aucune allocation', async () => {
    const result = await acompteService.createClient(baseInput);

    expect(result.acompte.id).toBe(66);
    expect(result.allocation).toBeUndefined();

    const ledgerCall = mocks.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO compte_client_lignes'),
    );
    expect(ledgerCall?.[1]).toEqual([7, 66, 'ACO-66', 100000, null, 3]);
    expect(mocks.allocate).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledWith('COMMIT');
  });

  it('rejoue de façon idempotente sans réinsérer', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('WHERE idempotency_key')) {
        return { rows: [{ id: 55, tiers_id: 7, mouvement_caisse_id: 9 }] };
      }
      return { rows: [] };
    });

    const result = await acompteService.createFournisseur({ ...baseInput, idempotency_key: 'k1' });

    expect(result.idempotent).toBe(true);
    expect(result.acompte.id).toBe(55);
    expect(result.mouvement_caisse_id).toBe(9);
    expect(
      mocks.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO acomptes_fournisseur')),
    ).toBe(false);
    expect(mocks.query).toHaveBeenCalledWith('COMMIT');
  });

  it('espèces sans magasin ni session → 422 et ROLLBACK', async () => {
    await expect(
      acompteService.createFournisseur({ ...baseInput, methode_paiement: 'espece' }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(mocks.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('tiers sans le rôle requis → 422', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM tiers')) return { rows: [{ id: 7, has_role: false }] };
      return { rows: [] };
    });

    await expect(acompteService.createClient(baseInput)).rejects.toMatchObject({ statusCode: 422 });
    expect(mocks.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('méthode de paiement invalide → 400 avant toute connexion', async () => {
    await expect(
      acompteService.createClient({ ...baseInput, methode_paiement: 'bitcoin' as never }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});
