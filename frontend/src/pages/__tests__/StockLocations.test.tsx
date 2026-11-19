import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import StockLocations from '../StockLocations';

const auth = vi.hoisted(() => ({ role: 'admin' }));

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'test', role: auth.role } }),
}));

vi.mock('../../services/api', () => ({
  stockLocationService: { getAll: vi.fn(), getStockLevels: vi.fn(), create: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { stockLocationService } from '../../services/api';

const LOCATIONS = [
  { id: 1, code: 'DEP-VRD', nom: 'Dépôt Vridi', adresse: null, responsable_id: null, responsable_username: null, actif: true, est_principal: true, location_type: 'depot', created_at: '2026-01-01' },
];

const renderPage = () =>
  render(
    <MemoryRouter>
      <StockLocations />
    </MemoryRouter>
  );

describe('StockLocations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.role = 'admin';
    vi.mocked(stockLocationService.getAll).mockResolvedValue(LOCATIONS);
  });

  it('offers « Nouvel emplacement » to managers only', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: /Nouvel emplacement/ })).toBeInTheDocument();
  });

  it('keeps the list read-only for depot staff', async () => {
    auth.role = 'depot_staff';
    renderPage();
    expect((await screen.findAllByText('Dépôt Vridi')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Nouvel emplacement/ })).not.toBeInTheDocument();
  });

  it('opens the location stock in a panel and shows a failure instead of an empty stock', async () => {
    const user = userEvent.setup();
    vi.mocked(stockLocationService.getStockLevels).mockRejectedValue(new Error('réseau'));
    renderPage();

    await user.click((await screen.findAllByRole('button', { name: 'Voir le stock de Dépôt Vridi' }))[0]);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByText('Impossible de charger le stock de cet emplacement')).toBeInTheDocument();
    expect(screen.queryByText('Aucun stock à cet emplacement')).not.toBeInTheDocument();
  });
});
