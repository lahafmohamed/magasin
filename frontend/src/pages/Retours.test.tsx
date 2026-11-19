import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
  creditNoteService: {
    createFromRetour: vi.fn(),
  },
}));

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 2, role: 'manager' } }),
  useOptionalAuth: () => ({ user: { id: 2, role: 'manager' } }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const confirmMock = vi.fn();
vi.mock('@/components/ui/confirm-dialog', () => ({
  useConfirm: () => confirmMock,
}));

import { creditNoteService, retourService } from '../services/api';

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
    avoir_id: null,
    numero_avoir: null,
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
    avoir_id: null,
    numero_avoir: null,
  },
  {
    id: 3,
    numero_retour: 'RET-2026-00003',
    client_nom: 'Hôtel Ivoire Lagune',
    total_remboursement: '10000',
    statut: 'traite',
    notes: null,
    created_at: '2026-08-15T10:00:00Z',
    cree_par_username: 'admin',
    avoir_id: 9,
    numero_avoir: 'AVOIR-2026-00009',
  },
];

const mockStats = {
  total_retours: '3',
  en_attente: '1',
  traites: '2',
  annules: '0',
  montant_total_rembourse: '50000',
  montant_en_attente: '125000',
};

const renderPage = (url = '/retours') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/retours" element={<Retours />} />
        <Route path="/avoirs/:id" element={<p>Fiche avoir</p>} />
      </Routes>
    </MemoryRouter>
  );

/** Le tableau (ordinateur) ; les cartes (téléphone) sont rendues à côté et masquées par CSS. */
const table = () => within(screen.getByRole('table'));

describe('Retours', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (retourService.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockRetours,
      pagination: { page: 1, limit: 20, total: 3, totalPages: 1 },
    });
    (retourService.getStats as ReturnType<typeof vi.fn>).mockResolvedValue(mockStats);
  });

  it('lists returns with their status and refund amount', async () => {
    renderPage();

    await waitFor(() => {
      expect(table().getByText('RET-2026-00001')).toBeInTheDocument();
    });
    expect(table().getByText('Kouassi Informatique')).toBeInTheDocument();
    // Montants en FCFA, séparateurs d'espace, zéro décimale.
    expect(table().getByText(/125\s*000\s*FCFA/)).toBeInTheDocument();
  });

  it('opens on the status carried by the dashboard link and asks the server for it', async () => {
    renderPage('/retours?statut=en_attente');

    await waitFor(() => expect(retourService.getAll).toHaveBeenCalledWith(1, 20, 'en_attente'));
    const filters = screen.getByRole('group', { name: 'Filtrer par statut' });
    expect(within(filters).getByRole('button', { name: 'En attente' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(filters).getByRole('button', { name: 'Tous' }));
    await waitFor(() => expect(retourService.getAll).toHaveBeenLastCalledWith(1, 20, undefined));
  });

  it('labels the money tile with what it really counts (CP-RET-02)', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Valeur des retours approuvés')).toBeInTheDocument();
    });
    expect(screen.queryByText('Total remboursé')).not.toBeInTheDocument();
  });

  it('only offers approval for pending returns', async () => {
    renderPage();

    await waitFor(() => {
      expect(table().getByText('RET-2026-00001')).toBeInTheDocument();
    });

    // Un seul retour est « en_attente » → un seul bouton Approuver dans le tableau.
    expect(table().getAllByRole('button', { name: /^Approuver le retour/ })).toHaveLength(1);
  });

  it('restocks only after confirmation of the approval, without promising money', async () => {
    confirmMock.mockResolvedValue(false);
    renderPage();

    await waitFor(() => {
      expect(table().getByText('RET-2026-00001')).toBeInTheDocument();
    });

    fireEvent.click(table().getByRole('button', { name: 'Approuver le retour RET-2026-00001' }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    const options = confirmMock.mock.calls[0][0];
    expect(options.description).toMatch(/remis en stock/);
    expect(options.description).not.toMatch(/seront dus au client/);
    // Confirmation refusée : aucun appel de mise à jour du statut.
    expect(retourService.updateStatut).not.toHaveBeenCalled();
  });

  it('offers « Créer l’avoir » only on an approved return without avoir (U-08)', async () => {
    renderPage();

    await waitFor(() => {
      expect(table().getByText('RET-2026-00002')).toBeInTheDocument();
    });
    const buttons = table().getAllByRole('button', { name: /^Créer l’avoir du retour/ });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName('Créer l’avoir du retour RET-2026-00002');
    // Le retour qui a déjà son avoir l'affiche, et ne s'annule plus d'ici.
    expect(table().getByRole('link', { name: 'AVOIR-2026-00009' })).toHaveAttribute('href', '/avoirs/9');
    expect(table().queryByRole('button', { name: 'Annuler le retour RET-2026-00003' })).not.toBeInTheDocument();
  });

  it('creates the avoir from the return, then opens it', async () => {
    confirmMock.mockResolvedValue(true);
    (creditNoteService.createFromRetour as ReturnType<typeof vi.fn>).mockResolvedValue({
      avoir_id: 12,
      numero_avoir: 'AVOIR-2026-00012',
    });
    renderPage();

    await waitFor(() => {
      expect(table().getByText('RET-2026-00002')).toBeInTheDocument();
    });
    fireEvent.click(table().getByRole('button', { name: 'Créer l’avoir du retour RET-2026-00002' }));

    await waitFor(() => expect(creditNoteService.createFromRetour).toHaveBeenCalledWith(2));
    expect(confirmMock.mock.calls[0][0].confirmLabel).toMatch(/^Créer l’avoir de 40\s000\sFCFA$/);
    expect(await screen.findByText('Fiche avoir')).toBeInTheDocument();
  });

  it('surfaces a load failure instead of showing an empty list', async () => {
    (retourService.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Impossible de charger les retours')).toBeInTheDocument();
    });
    expect(screen.queryByText('Aucun retour enregistré')).not.toBeInTheDocument();
  });

  it('marks the tiles unavailable when the statistics fail', async () => {
    (retourService.getStats as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('Indisponible')).toHaveLength(4);
    });
  });
});
