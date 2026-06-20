import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Factures from '../Factures';

vi.mock('../../services/api', () => ({
  factureService: {
    getAll: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0, totalPages: 0 } }),
    exportAll: vi.fn().mockResolvedValue({ data: [] }),
    getStats: vi.fn().mockResolvedValue({
      total_factures: { count: 0, montant: 0 },
      factures_mois: { count: 0, montant: 0 },
      alertes_stock: 0,
    }),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('Factures', () => {
  it('should render the Exporter en CSV button', async () => {
    render(<Factures />);
    const csvButton = screen.getByText('Exporter en CSV');
    expect(csvButton).toBeDefined();
  });
});
