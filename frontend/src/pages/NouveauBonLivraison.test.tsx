import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NouveauBonLivraison from './NouveauBonLivraison';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigateMock,
}));

vi.mock('../services/api', () => ({
  bonLivraisonService: { create: vi.fn() },
  devisService: { getAll: vi.fn(), getById: vi.fn() },
  produitService: { searchFuzzy: vi.fn() },
  tiersService: { getById: vi.fn(), search: vi.fn(), createClient: vi.fn() },
}));

vi.mock('../lib/AuthContext', () => ({
  useOptionalAuth: () => ({ user: { id: 3, role: 'magasin_staff' }, hasRole: (...r: string[]) => r.includes('magasin_staff') }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { bonLivraisonService, devisService, produitService, tiersService } from '../services/api';
import { toast } from 'sonner';

const mocked = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

describe('NouveauBonLivraison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocked(devisService.getAll).mockResolvedValue({
      data: [{ id: 11, numero_devis: 'DEV-2026-00011', client_nom: 'Cabinet Cygnus Consulting', total: 1190000, statut: 'accepte' }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
    mocked(devisService.getById).mockResolvedValue({
      id: 11,
      numero_devis: 'DEV-2026-00011',
      tiers_id: 5,
      lignes: [
        { produit_id: 1, produit_nom: 'HP ProBook 450 G10', produit_reference: 'INF-LAP-001', quantite: 2, prix_unitaire: '595000.00' },
      ],
    });
    mocked(tiersService.getById).mockResolvedValue({
      id: 5,
      code: 'CLI-0005',
      raison_sociale: 'Cabinet Cygnus Consulting',
      prenom: null,
      telephone: null,
      email: null,
      est_client: true,
      est_fournisseur: false,
    });
    mocked(produitService.searchFuzzy).mockResolvedValue([]);
    mocked(bonLivraisonService.create).mockResolvedValue({ id: 44, numero_bl: 'BL-2026-00044', total: 1190000 });
  });

  it('le devis choisi fixe le client et reprend ses lignes ; création puis ouverture du bon', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <MemoryRouter>
        <NouveauBonLivraison />
      </MemoryRouter>
    );

    const devisInput = screen.getByRole('combobox', { name: /Devis d’origine/ });
    await user.type(devisInput, 'DEV-2026-00011');
    await screen.findByRole('option', { name: /DEV-2026-00011/ });
    // Entrée choisit l'unique résultat, sans soumettre le formulaire.
    await user.keyboard('{Enter}');

    const table = await screen.findByRole('table', { name: 'Lignes du bon de livraison' });
    expect(within(table).getByText('HP ProBook 450 G10')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Quantité livrée — HP ProBook 450 G10' })).toHaveValue('2');
    expect(screen.getAllByText('Cabinet Cygnus Consulting').length).toBeGreaterThan(0);
    expect(bonLivraisonService.create).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole('button', { name: 'Créer le bon de livraison' })[0]);
    await waitFor(() =>
      expect(bonLivraisonService.create).toHaveBeenCalledWith({
        tiers_id: 5,
        devis_id: 11,
        lignes: [{ produit_id: 1, quantite_commandee: 2, quantite_livree: 2, prix_unitaire: 595000 }],
        notes: undefined,
      })
    );
    expect(toast.success).toHaveBeenCalledWith('Bon de livraison BL-2026-00044 créé');
    expect(navigateMock).toHaveBeenCalledWith('/bons-livraison/44', { replace: true, state: { justCreated: true } });
  });

  it('une quantité livrée supérieure à la commandée est refusée sous la ligne', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <MemoryRouter>
        <NouveauBonLivraison />
      </MemoryRouter>
    );
    await user.type(screen.getByRole('combobox', { name: /Devis d’origine/ }), 'DEV');
    await user.click(await screen.findByRole('option', { name: /DEV-2026-00011/ }));
    const livree = await screen.findByRole('textbox', { name: 'Quantité livrée — HP ProBook 450 G10' });
    await user.clear(livree);
    await user.type(livree, '3');
    await user.click(screen.getAllByRole('button', { name: 'Créer le bon de livraison' })[0]);
    expect(await screen.findByText('La quantité livrée dépasse la quantité commandée.')).toBeInTheDocument();
    expect(bonLivraisonService.create).not.toHaveBeenCalled();
  });
});
