import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StockValuation from '../StockValuation';

vi.mock('../../services/api', () => ({
  produitService: { getStockValuation: vi.fn(), getStockByCategory: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { produitService } from '../../services/api';

const renderPage = () =>
  render(
    <MemoryRouter>
      <StockValuation />
    </MemoryRouter>
  );

describe('StockValuation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never shows a failed load as zero', async () => {
    vi.mocked(produitService.getStockValuation).mockRejectedValue(new Error('réseau'));
    vi.mocked(produitService.getStockByCategory).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('Impossible de charger la valorisation du stock')).toBeInTheDocument();
    expect(screen.getAllByText('Indisponible')).toHaveLength(4);
    expect(screen.queryByText(/^0\s*FCFA$/)).not.toBeInTheDocument();
  });

  it('shows a negative category margin with a minus sign, not a green badge', async () => {
    vi.mocked(produitService.getStockValuation).mockResolvedValue({
      total_produits: '2',
      total_unites: '10',
      valeur_achat: '120000',
      valeur_vente: '100000',
      marge_potentielle: '-20000',
    });
    vi.mocked(produitService.getStockByCategory).mockResolvedValue([
      { categorie: 'Câbles', nombre_produits: '2', total_unites: '10', valeur_achat: '120000', valeur_vente: '100000' },
    ]);
    renderPage();

    const margins = await screen.findAllByText(/−\s*20\s*000\s*FCFA/);
    expect(margins.length).toBeGreaterThan(0);
    expect(margins.some((el) => el.className.includes('text-danger-700'))).toBe(true);
  });
});
