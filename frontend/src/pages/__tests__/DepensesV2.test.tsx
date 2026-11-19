import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DepensesV2 from '../DepensesV2';

vi.mock('@/services/api', () => ({
  caisseService: {
    getMagasins: vi.fn(),
    getSessionActive: vi.fn(),
  },
  depenseService: {
    getAll: vi.fn(),
    getCategories: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 3, role: 'caissier' } }),
  useOptionalAuth: () => ({ user: { id: 3, role: 'caissier' } }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const confirmMock = vi.fn();
vi.mock('@/components/ui/confirm-dialog', () => ({
  useConfirm: () => confirmMock,
}));

import { caisseService, depenseService } from '@/services/api';

const rows = [
  {
    id: 9,
    numero_depense: 'DEP-2026-00009',
    magasin_id: 1,
    categorie_nom: 'Repas / Restauration',
    montant: 9000,
    methode_paiement: 'espece',
    date_depense: '2026-10-22T00:00:00.000Z',
    description: 'Déjeuner équipe inventaire',
    beneficiaire_libre: null,
    fournisseur_nom: null,
    session_caisse_id: 3,
  },
  {
    id: 8,
    numero_depense: 'DEP-2026-00008',
    magasin_id: 1,
    categorie_nom: 'Entretien',
    montant: 15000,
    methode_paiement: 'virement',
    date_depense: '2026-10-20T00:00:00.000Z',
    description: 'Réparation climatiseur magasin',
    beneficiaire_libre: 'Froid Service CI',
    fournisseur_nom: null,
    session_caisse_id: null,
  },
];

const renderPage = (entry = '/depenses') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <DepensesV2 />
    </MemoryRouter>
  );

const textOf = (el: Element | null) => (el?.textContent ?? '').replace(/[\u00A0\u202F]/g, ' ');

/** Ligne estomp\u00E9e en t\u00EAte de liste : \u00AB 9 d\u00E9penses \u00B7 24 000 FCFA \u00BB. */
const listMeta = () =>
  screen.queryByText((_, el) => el?.tagName === 'P' && /^\d[\d\s\u00A0]* d\u00E9penses? \u00B7 /.test(textOf(el)));

describe('DepensesV2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (caisseService.getMagasins as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, code: 'MAG-PLT', nom: 'Hitek Plateau' },
    ]);
    (caisseService.getSessionActive as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 3, statut: 'ouverte' });
    (depenseService.getCategories as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 7, code: 'REPAS', nom: 'Repas / Restauration' },
    ]);
    // Forme réelle de `depenseService.getAll` : une page { data, pagination }.
    (depenseService.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: rows,
      pagination: { page: 1, limit: 20, total: 9, totalPages: 1 },
    });
  });

  it('lists the expenses of the page (the paginated response is not read as an array)', async () => {
    renderPage();

    // Tableau (bureau) et cartes (téléphone) sont tous deux dans le DOM.
    expect((await screen.findAllByText('DEP-2026-00009')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('DEP-2026-00008').length).toBeGreaterThan(0);
    expect(screen.queryByText('Aucune dépense enregistrée')).not.toBeInTheDocument();

    expect(depenseService.getAll).toHaveBeenCalledWith(expect.objectContaining({ magasin_id: 1, page: 1 }));

    // Une ligne estompée en tête de liste : le total serveur et la somme de la
    // page — plus de tuiles. Une seule page : pas de « sur cette page ».
    expect(textOf(listMeta())).toBe('9 dépenses · 24 000 FCFA');
    expect(screen.queryByText('Dépenses trouvées')).not.toBeInTheDocument();
    expect(screen.queryByText('Total des dépenses affichées')).not.toBeInTheDocument();
  });

  it('says the sum covers this page only when there are several pages', async () => {
    (depenseService.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: rows,
      pagination: { page: 1, limit: 20, total: 45, totalPages: 3 },
    });
    renderPage();
    await screen.findAllByText('DEP-2026-00009');

    expect(textOf(listMeta())).toBe('45 dépenses · 24 000 FCFA sur cette page');
  });

  it('names the cash effect before deleting a cash expense', async () => {
    confirmMock.mockResolvedValue(false);
    renderPage();
    await screen.findAllByText('DEP-2026-00009');

    fireEvent.click(screen.getAllByRole('button', { name: 'Supprimer la dépense DEP-2026-00009' })[0]);

    await waitFor(() =>
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          confirmLabel: 'Supprimer la dépense',
          destructive: true,
          description: expect.stringContaining('remis au solde de la caisse'),
        })
      )
    );
    expect(depenseService.delete).not.toHaveBeenCalled();
  });

  it('shows an error state, not an empty list, when the expenses fail to load', async () => {
    (depenseService.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('réseau'));
    renderPage();

    expect(await screen.findByText('Impossible de charger les dépenses')).toBeInTheDocument();
    expect(screen.queryByText('Aucune dépense enregistrée')).not.toBeInTheDocument();
    // Ni compte ni somme de liste : jamais « 0 dépense · 0 FCFA » pour une liste indisponible.
    expect(listMeta()).not.toBeInTheDocument();
  });

  it('opens the new-expense form from the till’s « Nouvelle dépense » link (P-M3)', async () => {
    renderPage('/depenses?nouvelle=1');

    expect(await screen.findByRole('dialog', { name: 'Nouvelle dépense' })).toBeInTheDocument();
    // Le montant d'abord : la date du jour est déjà remplie.
    await waitFor(() => expect(screen.getByLabelText(/Montant/)).toHaveFocus());
  });

  it('labels a non-cash expense « Hors espèces », not the audit word « Hors caisse » (CPG-01)', async () => {
    renderPage();
    await screen.findAllByText('DEP-2026-00008');
    expect(screen.getAllByText('Hors espèces').length).toBeGreaterThan(0);
    expect(screen.queryByText('Hors caisse')).not.toBeInTheDocument();
  });

  it('states an open till in the header, keeping the banner for a closed till only', async () => {
    renderPage();
    await screen.findAllByText('DEP-2026-00009');
    expect(await screen.findByText('Ouverte')).toBeInTheDocument();
    expect(screen.getByText('Caisse ouverte : les dépenses en espèces en sont déduites')).toBeInTheDocument();
    expect(screen.queryByText(/Caisse fermée/)).not.toBeInTheDocument();
  });

  it('warns when the till is closed', async () => {
    (caisseService.getSessionActive as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    renderPage();
    expect(await screen.findByText(/Caisse fermée : ouvrez la caisse/)).toBeInTheDocument();
    expect(screen.queryByText('Ouverte')).not.toBeInTheDocument();
  });

  it('orients the first use with the next action', async () => {
    (depenseService.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    renderPage();

    expect(await screen.findByText('Aucune dépense enregistrée')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Nouvelle dépense/ }).length).toBeGreaterThan(1);
  });
});
