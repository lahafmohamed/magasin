import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import Reporting from './Reporting';

vi.mock('@/services/api', () => ({
  reportService: {
    getDashboard: vi.fn().mockResolvedValue({}),
    getPnl: vi.fn().mockResolvedValue({ chiffre_affaires: 0, cout_ventes: 0, marge_brute: 0, marge_pourcentage: 0 }),
    getSalesByCategory: vi.fn().mockResolvedValue([]),
    getProductPerformance: vi.fn().mockResolvedValue([]),
    getMargins: vi.fn().mockResolvedValue({}),
    getReceivables: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0, totalPages: 1 }, summary: { montant_total: 0 } }),
    exportReceivables: vi.fn(),
  },
  stockLocationService: { getAll: vi.fn().mockResolvedValue([]) },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

describe('Reporting', () => {
  it('puts the period in the tab row it scopes, with its meaning kept for screen readers', async () => {
    render(<Reporting />);
    const tabs = await screen.findByRole('tablist');

    const period = screen.getByRole('group', { name: 'Période du compte de résultat, des ventes et des marges' });
    expect(within(period).getByLabelText('Du')).toBeInTheDocument();
    expect(within(period).getByLabelText('Au')).toBeInTheDocument();
    // Même rangée que les onglets, plus de carte posée au-dessus avec sa légende.
    expect(period.parentElement).toBe(tabs.parentElement);
    expect(screen.queryByText('Période du compte de résultat, des ventes et des marges')).not.toBeInTheDocument();
  });
});
