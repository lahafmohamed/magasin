import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Payroll from './Payroll';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { payrollService } from '../services/api';

vi.mock('../services/api', () => ({
  payrollService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    getConfig: vi.fn(),
    create: vi.fn(),
    validate: vi.fn(),
    markPaid: vi.fn(),
    cancel: vi.fn(),
    remove: vi.fn(),
    getPayslipPdf: vi.fn(),
  },
}));

const auth = vi.hoisted(() => ({ role: 'admin' }));
vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({
    user: { role: auth.role },
    hasRole: (...roles: string[]) => roles.includes(auth.role),
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const RUN_VALIDE = {
  id: 1,
  numero: 'PAIE-2026-0001',
  periode: '2026-09',
  date_debut: '2026-09-01',
  date_fin: '2026-09-30',
  statut: 'valide',
  total_brut: '1450000',
  total_commissions: '35000',
  total_primes: '0',
  total_deductions: '0',
  total_cnps: '91350',
  total_its: '74100',
  total_net: '1284550',
  nb_bulletins: '6',
  notes: null,
};

const RUN_BROUILLON = { ...RUN_VALIDE, id: 2, numero: 'PAIE-2026-0002', periode: '2026-10', statut: 'brouillon' };

function renderPage() {
  return render(
    <MemoryRouter>
      <ConfirmProvider>
        <Payroll />
      </ConfirmProvider>
    </MemoryRouter>
  );
}

describe('Payroll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.role = 'admin';
    vi.mocked(payrollService.getAll).mockResolvedValue({
      data: [RUN_VALIDE, RUN_BROUILLON],
      pagination: { total: 2, totalPages: 1 },
    });
    vi.mocked(payrollService.getById).mockResolvedValue({ ...RUN_VALIDE, payslips: [] });
  });

  it('opens a pay run from the keyboard (A11Y S04) and moves focus to its title', async () => {
    const user = userEvent.setup();
    renderPage();
    const table = await screen.findByRole('table', { name: 'Cycles de paie' });
    const trigger = within(table).getByRole('button', { name: 'Ouvrir le cycle de paie PAIE-2026-0001' });

    trigger.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(payrollService.getById).toHaveBeenCalledWith(1));
    const heading = await screen.findByRole('heading', { level: 1, name: 'PAIE-2026-0001' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole('button', { name: /Marquer comme payé/ })).toBeInTheDocument();
    expect(screen.getByText('septembre 2026', { exact: false })).toBeInTheDocument();
    // Rendu du cycle (en-tête, tuiles, tableau) : lent quand toute la suite tourne en parallèle.
  }, 20_000);

  it('filters by status with toggle chips, not tabs without panels', async () => {
    const user = userEvent.setup();
    renderPage();
    const group = await screen.findByRole('group', { name: 'Filtrer par statut' });
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();

    const tous = within(group).getByRole('button', { name: 'Tous' });
    const paye = within(group).getByRole('button', { name: 'Payé' });
    expect(tous).toHaveAttribute('aria-pressed', 'true');
    expect(paye).toHaveAttribute('aria-pressed', 'false');

    await user.click(paye);
    expect(paye).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Aucun cycle avec ce statut')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Afficher tous les cycles' }));
    expect(screen.getByRole('table', { name: 'Cycles de paie' })).toBeInTheDocument();
  });

  it('hides the draft deletion from the manager, whom the API refuses (U-13)', async () => {
    auth.role = 'manager';
    renderPage();
    await screen.findByRole('table', { name: 'Cycles de paie' });
    expect(screen.queryAllByRole('button', { name: /Supprimer le cycle de paie/ })).toHaveLength(0);
  });

  it('offers the draft deletion to the administrator only on drafts', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: 'Cycles de paie' });
    expect(within(table).getByRole('button', { name: 'Supprimer le cycle de paie PAIE-2026-0002' })).toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: 'Supprimer le cycle de paie PAIE-2026-0001' })).not.toBeInTheDocument();
  });
});
