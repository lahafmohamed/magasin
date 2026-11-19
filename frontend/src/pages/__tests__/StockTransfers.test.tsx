import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StockTransfers from '../StockTransfers';
import { stockTransferService } from '../../services/api';

vi.mock('../../services/api', () => ({
  stockTransferService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    complete: vi.fn(),
    cancel: vi.fn(),
  },
  stockLocationService: {
    getAll: vi.fn().mockResolvedValue([]),
    getProductsWithStock: vi.fn().mockResolvedValue([]),
  },
}));

const auth: { user: { id: number; role: string } } = { user: { id: 7, role: 'depot_staff' } };
vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => auth,
  useOptionalAuth: () => auth,
}));

const confirmMock = vi.fn().mockResolvedValue(true);
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => confirmMock }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const row = (id: number, statut: string) => ({
  id,
  numero_transfer: `TRF-2026-0000${id}`,
  location_source_id: 1,
  location_destination_id: 2,
  source_nom: 'Dépôt Vridi',
  destination_nom: 'Hitek Plateau',
  date_transfer: '2026-10-23',
  statut,
  notes: null,
  created_at: '2026-10-23T10:00:00Z',
});

const rows = [row(4, 'en_preparation'), row(3, 'livre'), row(5, 'annule')];

function page(rowsToReturn = rows, total = rowsToReturn.length) {
  return { data: rowsToReturn, pagination: { page: 1, limit: 20, total, totalPages: 1 } };
}

function renderPage(url = '/stock-transfers') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <StockTransfers />
    </MemoryRouter>
  );
}

describe('Transferts de stock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: 7, role: 'depot_staff' };
    confirmMock.mockResolvedValue(true);
    // Décomptes serveur (pagination `total` d'une page d'une ligne) : 6 en tout.
    const totals: Record<string, number> = { all: 6, en_preparation: 1, livre: 4, annule: 1 };
    vi.mocked(stockTransferService.getAll).mockImplementation(async (_search, statut, _page, limit) =>
      limit === 1 ? page([], totals[statut ?? 'all'] ?? 0) : page()
    );
  });

  it('shows the database statuses in words, never as raw codes (VB-TRF-00)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText('TRF-2026-00004').length).toBeGreaterThan(0));
    expect(screen.getAllByText('En préparation').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Livré').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Annulé').length).toBeGreaterThan(0);
    expect(screen.queryByText('en_preparation')).toBeNull();
    expect(screen.queryByText('livre')).toBeNull();
  });

  it('offers « Exécuter » only on a transfer still in preparation', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText('TRF-2026-00004').length).toBeGreaterThan(0));
    expect(screen.getAllByRole('button', { name: 'Exécuter le transfert TRF-2026-00004' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Exécuter le transfert TRF-2026-00003' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Exécuter le transfert TRF-2026-00005' })).toBeNull();
  });

  it('executes after a confirmation that names both locations', async () => {
    vi.mocked(stockTransferService.complete).mockResolvedValue(undefined);
    renderPage();
    const [button] = await screen.findAllByRole('button', { name: 'Exécuter le transfert TRF-2026-00004' });
    fireEvent.click(button);
    await waitFor(() => expect(stockTransferService.complete).toHaveBeenCalledWith(4));
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'Exécuter le transfert',
        description: 'Les quantités quitteront Dépôt Vridi et entreront dans Hitek Plateau.',
      })
    );
  });

  it('builds the status filter from the database values and filters on the server', async () => {
    // Le filtre vit dans l'adresse : `?statut=` pilote la requête serveur.
    renderPage('/stock-transfers?statut=en_preparation');
    await waitFor(() =>
      expect(stockTransferService.getAll).toHaveBeenCalledWith(undefined, 'en_preparation', 1, 20)
    );
    const filters = screen.getByRole('group', { name: 'Filtrer par statut' });
    expect(within(filters).getByRole('button', { name: /^En préparation/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(filters).getByRole('button', { name: /^Livré/ })).toBeInTheDocument();
    expect(within(filters).getByRole('button', { name: /^Annulé/ })).toBeInTheDocument();
    // Le statut transitoire n'est pas proposé comme filtre.
    expect(within(filters).queryByRole('button', { name: /En cours de livraison/ })).toBeNull();
  });

  it('reads the counts from the server into the status chips, not from the visible page', async () => {
    renderPage();
    await waitFor(() => expect(stockTransferService.getAll).toHaveBeenCalledWith(undefined, 'en_preparation', 1, 1));
    expect(stockTransferService.getAll).toHaveBeenCalledWith(undefined, 'livre', 1, 1);
    expect(stockTransferService.getAll).toHaveBeenCalledWith(undefined, 'annule', 1, 1);
    expect(stockTransferService.getAll).toHaveBeenCalledWith(undefined, undefined, 1, 1);
    const filters = screen.getByRole('group', { name: 'Filtrer par statut' });
    const chip = (name: RegExp) => within(filters).getByRole('button', { name });
    // 6 au total quand la page n'affiche que 3 lignes.
    await waitFor(() => expect(chip(/^Tous/)).toHaveTextContent(/^Tous\s*6$/));
    expect(chip(/^En préparation/)).toHaveTextContent(/^En préparation\s*1$/);
    expect(chip(/^Livré/)).toHaveTextContent(/^Livré\s*4$/);
    expect(chip(/^Annulé/)).toHaveTextContent(/^Annulé\s*1$/);
    // Les deux tuiles d'un chiffre ne répètent plus les puces.
    expect(screen.queryByText('Livrés')).toBeNull();
    expect(screen.queryByText('À exécuter')).toBeNull();
  });

  it('shows an error with a retry instead of « 0 transferts » when the list fails (VB-TRF-01)', async () => {
    vi.mocked(stockTransferService.getAll).mockRejectedValue(new Error('réseau'));
    renderPage();
    expect((await screen.findAllByText('Impossible de charger la liste')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Aucun transfert de stock')).toBeNull();
    expect(screen.getAllByRole('button', { name: /Réessayer/ }).length).toBeGreaterThan(0);
  });

  it('opens the detail from the URL with the actions of a transfer in preparation', async () => {
    vi.mocked(stockTransferService.getById).mockResolvedValue({
      ...row(4, 'en_preparation'),
      lignes: [
        { id: 1, produit_id: 9, produit_nom: 'Souris USB', reference: 'SOU-01', quantite_demandee: 3, quantite_transferee: null },
      ],
    });
    renderPage('/stock-transfers?transfert=4');
    expect(await screen.findByText('Souris USB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Exécuter le transfert$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Annuler le transfert$/ })).toBeInTheDocument();
  });

  it('hides the write actions from a role the API refuses', async () => {
    auth.user = { id: 3, role: 'caissier' };
    renderPage();
    await waitFor(() => expect(screen.getAllByText('TRF-2026-00004').length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: /Exécuter le transfert/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nouveau transfert' })).toBeNull();
  });
});
