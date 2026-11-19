import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Reapprovisionnement from '../Reapprovisionnement';
import { produitService } from '../../services/api';

vi.mock('../../services/api', () => ({
  produitService: { getReorderSuggestions: vi.fn() },
  commandeService: { create: vi.fn() },
}));

const auth = { user: { id: 1, role: 'depot_staff' } };
vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => auth,
  useOptionalAuth: () => auth,
}));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => vi.fn().mockResolvedValue(true) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('Suggestions d’achat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names the outcome on the primary button and explains products without a supplier', async () => {
    vi.mocked(produitService.getReorderSuggestions).mockResolvedValue([
      { produit_id: 1, reference: 'SOU-01', nom: 'Souris USB', prix_achat: '5000', stock_min: 5, stock: 1, fournisseur_id: 2, fournisseur_nom: 'HP Côte d’Ivoire SA', quantite_suggeree: 9 },
      { produit_id: 2, reference: 'CLA-01', nom: 'Clavier', prix_achat: '8000', stock_min: 5, stock: 0, fournisseur_id: null, fournisseur_nom: null, quantite_suggeree: 10 },
    ]);
    render(
      <MemoryRouter>
        <Reapprovisionnement />
      </MemoryRouter>
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Suggestions d’achat' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Créer 1 commande fournisseur/ })).toBeEnabled();
    expect(screen.getByText(/1 produit n’a pas de fournisseur par défaut/)).toBeInTheDocument();
    expect(screen.getAllByText('Aucun fournisseur').length).toBeGreaterThan(0);
  });

  it('sums up the selection in one line above the table, with the stock against its minimum', async () => {
    vi.mocked(produitService.getReorderSuggestions).mockResolvedValue([
      { produit_id: 1, reference: 'SOU-01', nom: 'Souris USB', prix_achat: '5000', stock_min: 5, stock: 1, fournisseur_id: 2, fournisseur_nom: 'HP Côte d’Ivoire SA', quantite_suggeree: 9 },
      { produit_id: 2, reference: 'CLA-01', nom: 'Clavier', prix_achat: '8000', stock_min: 5, stock: 0, fournisseur_id: null, fournisseur_nom: null, quantite_suggeree: 10 },
    ]);
    render(
      <MemoryRouter>
        <Reapprovisionnement />
      </MemoryRouter>
    );
    // 9 souris à 5 000 : le seul produit commandable est présélectionné.
    const summary = await screen.findByText(/sélectionné sur/);
    expect(summary).toHaveTextContent(/^1 sélectionné sur 2 · 45\s000\sFCFA estimés$/);
    // Plus de tuiles : le nombre de commandes est sur le bouton, les lignes dans le tableau.
    expect(screen.queryByText('Produits sous le stock minimum')).toBeNull();
    expect(screen.queryByText('Montant estimé')).toBeNull();
    // Une colonne « Stock » qui dit le minimum, plus de colonne « Stock min. ».
    expect(screen.getByRole('columnheader', { name: 'Stock' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Stock min.' })).toBeNull();
    const row = screen.getByRole('row', { name: /Souris USB/ });
    expect(within(row).getByText(/min\. 5/).parentElement).toHaveTextContent(/^1 · min\. 5$/);

    // Rien de sélectionné : la ligne dit quoi faire.
    fireEvent.click(within(row).getByRole('checkbox', { name: 'Sélectionner Souris USB' }));
    expect(screen.getByRole('status')).toHaveTextContent('Sélectionnez au moins un produit qui a un fournisseur par défaut');
    expect(screen.getByRole('button', { name: /Créer les commandes fournisseur/ })).toBeDisabled();
  });

  it('shows the error and a retry, without a summary, when the suggestions fail to load', async () => {
    vi.mocked(produitService.getReorderSuggestions).mockRejectedValue(new Error('réseau'));
    render(
      <MemoryRouter>
        <Reapprovisionnement />
      </MemoryRouter>
    );
    expect(await screen.findByText('Impossible de charger les suggestions d’achat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Réessayer/ })).toBeInTheDocument();
    expect(screen.queryByText(/sélectionné sur/)).toBeNull();
  });
});
