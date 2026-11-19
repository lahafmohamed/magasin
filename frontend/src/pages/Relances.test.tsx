import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Relances from '../pages/Relances';

vi.mock('../services/api', () => ({
  reportService: { getReceivables: vi.fn() },
  crmService: {
    listInteractions: vi.fn().mockResolvedValue([]),
    createInteraction: vi.fn(),
  },
  tiersService: {
    downloadRelevePdf: vi.fn(),
  },
}));

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 2, role: 'manager' } }),
  useOptionalAuth: () => ({ user: { id: 2, role: 'manager' } }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { reportService, crmService } from '../services/api';

/** 45 jours de retard, quel que soit le jour où le test tourne. */
const ilYA = (jours: number) =>
  new Date(Date.now() - jours * 86_400_000).toISOString().slice(0, 10);

const creances = [
  {
    client_id: 1,
    nom: 'Kouassi Informatique',
    prenom: null,
    telephone: '+225 07 00 00 00',
    email: 'kouassi@example.com',
    plus_ancienne_facture: ilYA(45),
    total_du: '250000',
    moins_30_jours: '0',
    entre_30_60_jours: '250000',
    plus_60_jours: '0',
  },
  {
    client_id: 2,
    nom: 'Diallo Services',
    prenom: null,
    telephone: null,
    email: null,
    plus_ancienne_facture: ilYA(90),
    total_du: '80000',
    moins_30_jours: '0',
    entre_30_60_jours: '0',
    plus_60_jours: '80000',
  },
];

const okResponse = {
  data: creances,
  pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
  summary: { montant_total: 330000 },
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <Relances />
    </MemoryRouter>
  );

/** Le tableau (ordinateur) ; les cartes (téléphone) sont rendues à côté et masquées par CSS. */
const table = () => within(screen.getByRole('table'));

describe('Relances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (reportService.getReceivables as ReturnType<typeof vi.fn>).mockResolvedValue(okResponse);
    (crmService.listInteractions as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('lists debtors with how long they have been overdue', async () => {
    renderPage();

    await waitFor(() => {
      expect(table().getByText('Kouassi Informatique')).toBeInTheDocument();
    });
    // L'ancienneté est le critère de relance : elle doit être lisible directement.
    expect(table().getByText('45 j')).toBeInTheDocument();
    expect(table().getByText('90 j')).toBeInTheDocument();
    expect(table().getByText(/250\s*000\s*FCFA/)).toBeInTheDocument();
  });

  it('shows the amount to collect over the whole filtered set, not 0', async () => {
    renderPage();

    await waitFor(() => {
      const tile = screen.getByText('Total à recouvrer').closest('.card-content-standalone');
      expect(tile?.textContent ?? '').toMatch(/330\s*000/);
    });
  });

  it('links each debtor to the contact sheet (U-38)', async () => {
    renderPage();

    const link = await waitFor(() => table().getByRole('link', { name: 'Kouassi Informatique' }));
    expect(link).toHaveAttribute('href', '/tiers/1');
  });

  it('flags clients that were never chased', async () => {
    renderPage();

    await waitFor(() => {
      expect(table().getAllByText('Jamais relancé')).toHaveLength(2);
    });
  });

  it('shows the date of the last chase when one exists', async () => {
    (crmService.listInteractions as ReturnType<typeof vi.fn>).mockResolvedValue([
      { tiers_id: 1, type: 'relance', date_interaction: '2026-08-10T09:00:00Z' },
    ]);
    renderPage();

    await waitFor(() => {
      // Format unique des dates de l'interface (utils/format, FND-A) : « 10 août 2026 ».
      expect(table().getByText('10 août 2026')).toBeInTheDocument();
    });
    expect(table().getAllByText('Jamais relancé')).toHaveLength(1);
  });

  it('keeps the list usable when the chase history cannot be loaded', async () => {
    (crmService.listInteractions as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    renderPage();

    // L'historique est un confort : son échec ne doit pas masquer les créances.
    await waitFor(() => {
      expect(table().getByText('Kouassi Informatique')).toBeInTheDocument();
    });
  });

  it('keeps the whole-ledger totals when a filter empties the list (G-SLIST-01)', async () => {
    const empty = { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }, summary: { montant_total: 0 } };
    (reportService.getReceivables as ReturnType<typeof vi.fn>).mockImplementation(async (params: { search?: string }) =>
      params?.search ? empty : okResponse
    );
    renderPage();
    await waitFor(() => expect(table().getByText('Kouassi Informatique')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Rechercher un client'), { target: { value: 'zzz' } });
    expect(await screen.findByText('Aucune créance ne correspond aux filtres')).toBeInTheDocument();

    const tile = (label: string) =>
      (screen.getByText(label).closest('.card-content-standalone')?.textContent ?? '').replace(/\s+/g, ' ');
    await waitFor(() => expect(tile('Total à recouvrer')).toContain('Selon les filtres : 0 FCFA'));
    // La balance entière reste affichée : jamais « 0 » tant que des clients doivent.
    expect(tile('Total à recouvrer')).toMatch(/330 000/);
    expect(tile('Clients débiteurs')).toMatch(/^Clients débiteurs\s*2/);
    expect(tile('Clients débiteurs')).toContain('Selon les filtres : 0 client');
  });

  it('surfaces a load failure instead of an empty list', async () => {
    (reportService.getReceivables as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Impossible de charger les créances')).toBeInTheDocument();
    });
    expect(screen.queryByText('Aucun client débiteur')).not.toBeInTheDocument();
    // Les indicateurs ne passent pas à zéro : ils disent qu'ils sont indisponibles.
    expect(screen.getAllByText('Indisponible').length).toBeGreaterThan(0);
  });
});
