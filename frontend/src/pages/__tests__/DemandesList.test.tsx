import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DemandesList from '../DemandesList';
import { demandeService } from '../../services/api';

vi.mock('../../services/api', () => ({
  demandeService: { getAll: vi.fn() },
}));

const auth: { user: { id: number; role: string } } = { user: { id: 7, role: 'depot_staff' } };
vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => auth,
  useOptionalAuth: () => auth,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const row = (id: number, statut: string) => ({
  id,
  numero: `DEM-2026-0000${id}`,
  statut,
  magasin_nom: 'Hitek Plateau',
  depot_nom: 'Dépôt Vridi',
  magasin_code: 'MAG-PLT',
  depot_code: 'DEP-VRD',
  created_by_nom: 'Seydou Diallo',
  date_creation: '2026-10-23T08:00:00Z',
  date_envoi: null,
  numero_transfer: null,
});

type Filters = { statut?: string; page?: number; limit?: number };

function renderPage(url = '/demandes') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <DemandesList />
    </MemoryRouter>
  );
}

describe('Demandes de réapprovisionnement — liste', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: 7, role: 'depot_staff' };
    vi.mocked(demandeService.getAll).mockImplementation(async (filters?: Filters) => {
      if (filters?.limit === 1) {
        // Décomptes serveur ; « all » = sans statut.
        const totals: Record<string, number> = {
          all: 9,
          envoyee: 2,
          approuvee: 1,
          partiellement_approuvee: 1,
          refusee: 0,
          livree: 3,
          cloturee: 2,
        };
        return { data: [], pagination: { page: 1, limit: 1, total: totals[filters.statut ?? 'all'] ?? 0, totalPages: 1 } };
      }
      return {
        data: [row(6, 'envoyee'), row(5, 'approuvee'), row(4, 'livree')],
        pagination: { page: 1, limit: 20, total: 3, totalPages: 1 },
      };
    });
  });

  it('labels the next step for the depot and links straight to the decision', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText('DEM-2026-00006').length).toBeGreaterThan(0));
    const decide = screen.getAllByRole('link', { name: 'Décider — demande DEM-2026-00006' })[0];
    expect(decide).toHaveAttribute('href', '/demandes/6?action=decider');
    expect(screen.getAllByRole('link', { name: 'Exécuter — demande DEM-2026-00005' }).length).toBeGreaterThan(0);
    // La clôture revient au magasin : rien pour le dépôt.
    expect(screen.queryByRole('link', { name: /Clôturer — demande DEM-2026-00004/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Nouvelle demande' })).toBeNull();
    // Le dépôt d'une demande est toujours le sien : pas de colonne « Dépôt ».
    expect(screen.queryByRole('columnheader', { name: 'Dépôt' })).toBeNull();
  });

  it('counts each status chip on the server, not on the visible page', async () => {
    renderPage();
    await waitFor(() => expect(demandeService.getAll).toHaveBeenCalledWith({ statut: 'envoyee', page: 1, limit: 1 }));
    for (const statut of ['approuvee', 'partiellement_approuvee', 'refusee', 'livree', 'cloturee', undefined]) {
      expect(demandeService.getAll).toHaveBeenCalledWith({ statut, page: 1, limit: 1 });
    }
    // Le dépôt ne voit pas les brouillons : ni puce, ni décompte.
    expect(demandeService.getAll).not.toHaveBeenCalledWith({ statut: 'brouillon', page: 1, limit: 1 });

    const filters = screen.getByRole('group', { name: 'Filtrer par statut' });
    const chip = (name: RegExp) => within(filters).getByRole('button', { name });
    // 9 au total quand la page n'affiche que 3 lignes.
    await waitFor(() => expect(chip(/^Toutes/)).toHaveTextContent(/^Toutes\s*9$/));
    expect(chip(/^Envoyée/)).toHaveTextContent(/^Envoyée\s*2$/);
    expect(chip(/^Approuvée/)).toHaveTextContent(/^Approuvée\s*1$/);
    expect(chip(/^Partiellement approuvée/)).toHaveTextContent(/^Partiellement approuvée\s*1$/);
    expect(chip(/^Livrée/)).toHaveTextContent(/^Livrée\s*3$/);
    expect(within(filters).queryByRole('button', { name: /^Brouillon/ })).toBeNull();
    // Plus de tuiles « À décider » / « À exécuter » qui répétaient ces puces.
    expect(screen.queryByText('À décider')).toBeNull();
    expect(screen.queryByText('À exécuter')).toBeNull();
  });

  it('passes the status from the URL to the server', async () => {
    renderPage('/demandes?statut=livree');
    await waitFor(() => expect(demandeService.getAll).toHaveBeenCalledWith({ statut: 'livree', page: 1, limit: 20 }));
  });

  it('does not offer « Nouvelle demande » to a cashier, who cannot send one', async () => {
    auth.user = { id: 3, role: 'caissier' };
    renderPage();
    await waitFor(() => expect(screen.getAllByText('DEM-2026-00006').length).toBeGreaterThan(0));
    expect(screen.queryByRole('link', { name: 'Nouvelle demande' })).toBeNull();
    // Hors personnel dépôt, la colonne « Dépôt » reste.
    expect(screen.getByRole('columnheader', { name: 'Dépôt' })).toBeInTheDocument();
  });

  it('shows an error with a retry instead of an empty list', async () => {
    vi.mocked(demandeService.getAll).mockRejectedValue(new Error('réseau'));
    renderPage();
    expect((await screen.findAllByText('Impossible de charger la liste')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Aucune demande à traiter')).toBeNull();
  });
});
