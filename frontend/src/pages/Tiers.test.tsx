import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TiersPage from './Tiers';
import { tiersService } from '../services/api';

vi.mock('../services/api', () => ({
  tiersService: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

const auth = vi.hoisted(() => ({ role: 'admin' }));
vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({
    user: { role: auth.role },
    hasRole: (...roles: string[]) => roles.includes(auth.role),
  }),
}));

vi.mock('../hooks/useExportExcel', () => ({
  useExportExcel: () => ({ exportToExcel: vi.fn() }),
}));

vi.mock('@/components/ui/confirm-dialog', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

type ListResponse = Awaited<ReturnType<typeof tiersService.getAll>>;

const CLIENT_ROW = {
  id: 7,
  code: 'CLI-002',
  raison_sociale: 'TRAORÉ',
  prenom: 'Mariama',
  telephone: '+225 05 22 02 02 02',
  email: null,
  adresse: null,
  nif: null,
  rccm: null,
  est_client: true,
  est_fournisseur: false,
  credit_max: '0',
  delai_paiement: null,
  delai_livraison: 7,
  notes: null,
  solde_client_actuel: '484225',
  acompte_client_disponible: 0,
  solde_fournisseur_actuel: '0',
  solde_client_live: '484225',
  solde_fournisseur_live: '0',
  solde_net: '484225',
  deleted_at: null,
  created_at: '2026-09-01',
  updated_at: '2026-09-01',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <TiersPage />
    </MemoryRouter>
  );
}

function openCreateDialog() {
  // L'en-tête porte l'action principale ; l'état vide en propose une seconde.
  fireEvent.click(screen.getAllByRole('button', { name: 'Nouveau contact' })[0]);
}

describe('Contact form validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.role = 'admin';
    vi.mocked(tiersService.getAll).mockResolvedValue({
      data: [],
      pagination: { total: 0, totalPages: 0 },
    } as ListResponse);
  });

  it('shows a French inline error and focuses the first empty required field', async () => {
    renderPage();
    await screen.findByText('Aucun contact pour le moment');
    openCreateDialog();

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Les champs marqués d’un * sont obligatoires');

    fireEvent.click(screen.getByRole('button', { name: 'Créer le contact' }));

    const error = await screen.findByText('Saisissez le nom ou la raison sociale du contact.');
    const nameInput = screen.getByLabelText(/Nom ou raison sociale/);

    expect(error).toHaveAttribute('role', 'alert');
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput).toHaveAccessibleDescription('Saisissez le nom ou la raison sociale du contact.');
    await waitFor(() => expect(nameInput).toHaveFocus());
    expect(tiersService.create).not.toHaveBeenCalled();
  });

  it('validates e-mail and contact type without native browser messages', async () => {
    renderPage();
    await screen.findByText('Aucun contact pour le moment');
    openCreateDialog();

    fireEvent.change(screen.getByLabelText(/Nom ou raison sociale/), {
      target: { value: 'Client Démonstration' },
    });
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), {
      target: { value: 'email-invalide' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Client' }));
    fireEvent.click(screen.getByRole('button', { name: 'Créer le contact' }));

    expect(await screen.findByText('Saisissez une adresse e-mail valide (ex. : nom@entreprise.ci).')).toBeInTheDocument();
    expect(screen.getByText('Cochez au moins un type : client ou fournisseur.')).toBeInTheDocument();
    expect(tiersService.create).not.toHaveBeenCalled();
  });
});

describe('Credit limit (CP-TIERS-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.role = 'admin';
    vi.mocked(tiersService.getAll).mockResolvedValue({
      data: [],
      pagination: { total: 0, totalPages: 0 },
    } as ListResponse);
    vi.mocked(tiersService.create).mockResolvedValue({ id: 99 });
  });

  it('says that 0 means no limit, what the limit blocks and the server maximum', async () => {
    renderPage();
    await screen.findByText('Aucun contact pour le moment');
    openCreateDialog();

    const field = screen.getByLabelText('Plafond de crédit (FCFA)');
    expect(field).toHaveAccessibleDescription(
      /^Laissez 0 pour ne fixer aucune limite\. Au-delà du plafond, les bons de livraison et factures à crédit de ce client sont refusés\. Maximum : 15\s000\s000\sFCFA\.$/
    );
  });

  it('hides the credit limit for a supplier-only contact and sends 0', async () => {
    renderPage();
    await screen.findByText('Aucun contact pour le moment');
    openCreateDialog();

    fireEvent.change(screen.getByLabelText(/Nom ou raison sociale/), { target: { value: 'Grossiste Plateau' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Fournisseur' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Client' }));
    expect(screen.queryByLabelText('Plafond de crédit (FCFA)')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Créer le contact' }));
    await waitFor(() =>
      expect(tiersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ raison_sociale: 'Grossiste Plateau', est_client: false, est_fournisseur: true, credit_max: 0 })
      )
    );
  });

  it('refuses a limit above the server maximum before sending', async () => {
    renderPage();
    await screen.findByText('Aucun contact pour le moment');
    openCreateDialog();

    fireEvent.change(screen.getByLabelText(/Nom ou raison sociale/), { target: { value: 'Client Démonstration' } });
    fireEvent.change(screen.getByLabelText('Plafond de crédit (FCFA)'), { target: { value: '20000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le contact' }));

    expect(await screen.findByText(/^Le plafond doit être compris entre 0 et 15\s000\s000\sFCFA\.$/)).toBeInTheDocument();
    expect(tiersService.create).not.toHaveBeenCalled();
  });
});

describe('Contact list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tiersService.getAll).mockResolvedValue({
      data: [CLIENT_ROW],
      pagination: { total: 1, totalPages: 1 },
    } as ListResponse);
  });

  it('states the balance direction in words instead of colour', async () => {
    auth.role = 'admin';
    renderPage();
    const table = await screen.findByRole('table', { name: 'Liste des contacts' });
    expect(table).toHaveTextContent('Il vous doit');
    expect(screen.getAllByRole('link', { name: 'TRAORÉ' })[0]).toHaveAttribute('href', '/tiers/7');
  });

  it('only offers deletion to the administrator (the API refuses it to managers)', async () => {
    auth.role = 'manager';
    const { unmount } = renderPage();
    await screen.findByRole('table', { name: 'Liste des contacts' });
    expect(screen.queryAllByRole('button', { name: /Plus d’actions pour/ })).toHaveLength(0);
    unmount();

    auth.role = 'admin';
    renderPage();
    await screen.findByRole('table', { name: 'Liste des contacts' });
    expect(screen.getAllByRole('button', { name: 'Plus d’actions pour TRAORÉ Mariama' }).length).toBeGreaterThan(0);
  });
});
