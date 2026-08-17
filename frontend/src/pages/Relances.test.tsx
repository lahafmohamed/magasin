import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import Relances from '../pages/Relances';

vi.mock('../services/api', () => ({
  api: { get: vi.fn() },
  crmService: {
    listInteractions: vi.fn().mockResolvedValue([]),
    createInteraction: vi.fn(),
  },
  tiersService: {
    downloadRelevePdf: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { api, crmService } from '../services/api';

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
  data: {
    data: creances,
    pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
    summary: { montant_total: 330000 },
  },
};

describe('Relances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as any).mockResolvedValue(okResponse);
    (crmService.listInteractions as any).mockResolvedValue([]);
  });

  it('lists debtors with how long they have been overdue', async () => {
    render(<Relances />);

    await waitFor(() => {
      expect(screen.getByText('Kouassi Informatique')).toBeInTheDocument();
    });
    // L'ancienneté est le critère de relance : elle doit être lisible directement.
    // On cible le tableau : « 90 j » apparaît aussi dans la tuile « créance la
    // plus ancienne », ce qui est voulu.
    const table = within(screen.getByRole('table'));
    expect(table.getByText('45 j')).toBeInTheDocument();
    expect(table.getByText('90 j')).toBeInTheDocument();
    expect(table.getByText(/250\s*000\s*FCFA/)).toBeInTheDocument();
  });

  it('flags clients that were never chased', async () => {
    render(<Relances />);

    await waitFor(() => {
      expect(screen.getAllByText('Jamais relancé')).toHaveLength(2);
    });
  });

  it('shows the date of the last chase when one exists', async () => {
    (crmService.listInteractions as any).mockResolvedValue([
      { tiers_id: 1, type: 'relance', date_interaction: '2026-08-10T09:00:00Z' },
    ]);
    render(<Relances />);

    await waitFor(() => {
      expect(screen.getByText('10/08/2026')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Jamais relancé')).toHaveLength(1);
  });

  it('keeps the list usable when the chase history cannot be loaded', async () => {
    (crmService.listInteractions as any).mockRejectedValue(new Error('boom'));
    render(<Relances />);

    // L'historique est un confort : son échec ne doit pas masquer les créances.
    await waitFor(() => {
      expect(screen.getByText('Kouassi Informatique')).toBeInTheDocument();
    });
  });

  it('surfaces a load failure instead of an empty list', async () => {
    (api.get as any).mockRejectedValue(new Error('boom'));
    render(<Relances />);

    await waitFor(() => {
      expect(screen.getByText('Échec du chargement')).toBeInTheDocument();
    });
    expect(screen.queryByText('Aucun client débiteur')).not.toBeInTheDocument();
  });
});
