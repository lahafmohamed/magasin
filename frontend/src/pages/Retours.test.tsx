import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Retours from '../pages/Retours';

vi.mock('../services/api', () => ({
  retourService: {
    getAll: vi.fn(),
    getStats: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    updateStatut: vi.fn(),
  },
  factureService: {
    getAll: vi.fn().mockResolvedValue({ data: [] }),
    getById: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const confirmMock = vi.fn();
vi.mock('@/components/ui/confirm-dialog', () => ({
  useConfirm: () => confirmMock,
}));

import { retourService } from '../services/api';

const mockRetours = [
  {
    id: 1,
    numero_retour: 'RET-2026-00001',
    client_nom: 'Kouassi Informatique',
    total_remboursement: '125000',
    statut: 'en_attente',
    notes: null,
    created_at: '2026-08-17T10:00:00Z',
    cree_par_username: 'admin',
  },
  {
    id: 2,
    numero_retour: 'RET-2026-00002',
    client_nom: 'Diallo Services',
    total_remboursement: '40000',
    statut: 'traite',
    notes: null,
    created_at: '2026-08-16T10:00:00Z',
    cree_par_username: 'admin',
  },
];

const mockStats = {
  total_retours: '2',
  en_attente: '1',
  traites: '1',
  annules: '0',
  montant_total_rembourse: '165000',
};

describe('Retours', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (retourService.getAll as any).mockResolvedValue({
      data: mockRetours,
      pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });
    (retourService.getStats as any).mockResolvedValue(mockStats);
  });

  it('lists returns with their status and refund amount', async () => {
    render(<Retours />);

    await waitFor(() => {
      expect(screen.getByText('RET-2026-00001')).toBeInTheDocument();
    });
    expect(screen.getByText('Kouassi Informatique')).toBeInTheDocument();
    // Montants en FCFA, séparateurs d'espace, zéro décimale.
    expect(screen.getByText(/125\s*000\s*FCFA/)).toBeInTheDocument();
  });

  it('only offers approval for pending returns', async () => {
    render(<Retours />);

    await waitFor(() => {
      expect(screen.getByText('RET-2026-00001')).toBeInTheDocument();
    });

    // Un seul retour est « en_attente » → un seul bouton Approuver.
    expect(screen.getAllByRole('button', { name: 'Approuver' })).toHaveLength(1);
  });

  it('restocks only after confirmation of the approval', async () => {
    confirmMock.mockResolvedValue(false);
    render(<Retours />);

    await waitFor(() => {
      expect(screen.getByText('RET-2026-00001')).toBeInTheDocument();
    });

    screen.getByRole('button', { name: 'Approuver' }).click();

    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    // Confirmation refusée : aucun appel de mise à jour du statut.
    expect(retourService.updateStatut).not.toHaveBeenCalled();
  });

  it('surfaces a load failure instead of showing an empty list', async () => {
    (retourService.getAll as any).mockRejectedValue(new Error('boom'));
    render(<Retours />);

    await waitFor(() => {
      expect(screen.getByText('Échec du chargement')).toBeInTheDocument();
    });
    expect(screen.queryByText('Aucun retour enregistré')).not.toBeInTheDocument();
  });
});
