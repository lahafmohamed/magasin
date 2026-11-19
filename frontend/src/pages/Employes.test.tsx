import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Employes from './Employes';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { employeService } from '../services/api';

vi.mock('../services/api', () => ({
  employeService: {
    getAll: vi.fn(),
    getCommissionSummary: vi.fn(),
    getCommissions: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const employe = (over: Record<string, unknown>) => ({
  id: 11,
  utilisateur_id: 3,
  username: 'a.yao',
  matricule: 'HTK-0011',
  nom_complet: 'Adjoua Yao',
  poste: 'Caissière principale',
  departement: 'Caisse',
  date_embauche: '2024-02-01',
  date_naissance: null,
  telephone: null,
  email: null,
  adresse: null,
  salaire_base: '180000',
  commission_taux: '0',
  actif: true,
  created_at: '2024-02-01T08:00:00.000Z',
  ...over,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <ConfirmProvider>
        <Employes />
      </ConfirmProvider>
    </MemoryRouter>
  );

describe('Employes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(employeService.getAll).mockResolvedValue({
      data: [employe({}), employe({ id: 18, matricule: 'HTK-0018', nom_complet: 'Yacouba Touré', poste: null, departement: 'Logistique' })],
      pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });
  });

  it('writes the job title under the name, next to the department, without a « Poste » column', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: 'Liste des employés' });

    expect(within(table).queryByRole('columnheader', { name: 'Poste' })).not.toBeInTheDocument();
    const nameCell = within(table).getByRole('button', { name: 'Adjoua Yao' }).closest('td') as HTMLElement;
    const poste = within(nameCell).getByText('Caissière principale');
    expect(poste.className).toContain('text-xs');
    expect(poste.className).toContain('text-muted-foreground');
    // Sans poste : rien sous le nom, pas de « — ».
    const sansPoste = within(table).getByRole('button', { name: 'Yacouba Touré' }).closest('td') as HTMLElement;
    expect(sansPoste).toHaveTextContent(/^Yacouba Touré$/);
  });

  it('shows the job title under the name on the phone card too', async () => {
    renderPage();
    await screen.findByRole('table', { name: 'Liste des employés' });

    const card = screen.getByRole('button', { name: 'Voir la fiche de Adjoua Yao, Caissière principale' }).closest('article') as HTMLElement;
    expect(within(card).getByText('Caissière principale')).toBeInTheDocument();
    expect(within(card).queryByText('Poste')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voir la fiche de Yacouba Touré' })).toBeInTheDocument();
  });
});
