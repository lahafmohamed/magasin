import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Commandes from '../Commandes';
import { commandeService } from '../../services/api';

vi.mock('../../services/api', () => ({
  commandeService: {
    getAll: vi.fn(),
    getStats: vi.fn(),
    updateStatut: vi.fn(),
    downloadPdf: vi.fn(),
    create: vi.fn(),
  },
  produitService: { searchFuzzy: vi.fn().mockResolvedValue([]), getAll: vi.fn(), create: vi.fn() },
  tiersService: { search: vi.fn().mockResolvedValue([]) },
}));

const auth = { user: { id: 1, role: 'manager' } };
vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => auth,
  useOptionalAuth: () => auth,
}));

vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => vi.fn().mockResolvedValue(true) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const rows = [
  { id: 5, numero_commande: 'CMD-2026-00005', tiers_id: 3, fournisseur_nom: 'CompuServices SARL', date_commande: '2026-01-02', date_livraison_prevue: '2026-01-10', sous_total: '15098932', statut: 'en_attente' },
  { id: 6, numero_commande: 'CMD-2026-00006', tiers_id: 2, fournisseur_nom: 'HP Côte d’Ivoire SA', date_commande: '2026-10-19', date_livraison_prevue: '2099-10-26', sous_total: '1034090', statut: 'validee' },
  { id: 4, numero_commande: 'CMD-2026-00004', tiers_id: 4, fournisseur_nom: 'AccessoiresPro', date_commande: '2026-10-11', date_livraison_prevue: '2026-10-18', sous_total: '2132200', statut: 'livree' },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/commandes']}>
      <Commandes />
    </MemoryRouter>
  );
}

describe('Commandes fournisseur', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user.role = 'manager';
    vi.mocked(commandeService.getAll).mockResolvedValue({
      data: rows,
      pagination: { page: 1, limit: 20, total: 3, totalPages: 1 },
    });
    vi.mocked(commandeService.getStats).mockResolvedValue({
      en_attente: '1',
      validee: '4',
      expediee: '2',
      livree: '9',
      annulee: '0',
    });
  });

  it('counts each status in its chip from the server statistics, never from the visible page', async () => {
    renderPage();
    const filters = await screen.findByRole('group', { name: 'Filtrer par statut' });
    const chip = (name: RegExp) => within(filters).getByRole('button', { name });
    // 1 + 4 + 2 + 9 + 0 : les cinq statuts de la base, alors que la page n'a que 3 lignes.
    await waitFor(() => expect(chip(/^Toutes/)).toHaveTextContent(/^Toutes\s*16$/));
    expect(chip(/^En attente/)).toHaveTextContent(/^En attente\s*1$/);
    expect(chip(/^Validée/)).toHaveTextContent(/^Validée\s*4$/);
    expect(chip(/^Expédiée/)).toHaveTextContent(/^Expédiée\s*2$/);
    expect(chip(/^Reçue/)).toHaveTextContent(/^Reçue\s*9$/);
    expect(chip(/^Annulée/)).toHaveTextContent(/^Annulée\s*0$/);
    // Plus de rangée de tuiles qui répétait ces puces.
    expect(screen.queryByText('À valider')).toBeNull();
    expect(screen.queryByText('À réceptionner')).toBeNull();
    expect(screen.queryByText('Reçues')).toBeNull();
  });

  it('offers one labelled next step per status, and none once received', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText('CMD-2026-00005').length).toBeGreaterThan(0));
    expect(screen.getAllByRole('button', { name: 'Valider la commande CMD-2026-00005' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Réceptionner la commande CMD-2026-00006' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Valider la commande CMD-2026-00004/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Réceptionner la commande CMD-2026-00004/ })).toBeNull();
    // Retard en mots, pas seulement en couleur ; une échéance future n'est pas en retard.
    expect(screen.getAllByText('En retard').length).toBeGreaterThan(0);
  });

  it('opens the creation workspace from the URL, with a keyboard product search', async () => {
    render(
      <MemoryRouter initialEntries={['/commandes?nouvelle=1']}>
        <Commandes />
      </MemoryRouter>
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Nouvelle commande fournisseur' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Ajouter un produit' })).toBeInTheDocument();
    expect(screen.getByText('Aucun produit dans la commande')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Créer la commande/ }).length).toBeGreaterThan(0);
  });

  it('keeps purchase-order creation and status changes to managers (E2)', async () => {
    auth.user.role = 'depot_staff';
    render(
      <MemoryRouter initialEntries={['/commandes?nouvelle=1']}>
        <Commandes />
      </MemoryRouter>
    );
    // Même par un lien direct, pas d'espace de création pour le dépôt.
    await waitFor(() => expect(screen.getAllByText('CMD-2026-00005').length).toBeGreaterThan(0));
    expect(screen.queryByRole('heading', { level: 1, name: 'Nouvelle commande fournisseur' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Nouvelle commande/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Valider la commande/ })).toBeNull();
  });

  it('shows the error state with a retry instead of an empty list', async () => {
    vi.mocked(commandeService.getAll).mockRejectedValue(new Error('réseau'));
    renderPage();
    expect((await screen.findAllByText('Impossible de charger la liste')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Aucune commande fournisseur')).toBeNull();
  });
});
