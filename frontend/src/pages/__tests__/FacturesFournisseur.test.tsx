import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FacturesFournisseur from '../FacturesFournisseur';
import { factureFournisseurService } from '../../services/api';

vi.mock('../../services/api', () => ({
  factureFournisseurService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    getStats: vi.fn(),
    create: vi.fn(),
    recordPayment: vi.fn(),
  },
  acompteFournisseurService: { listForFournisseur: vi.fn().mockResolvedValue([]), apply: vi.fn() },
  receptionService: { getAll: vi.fn().mockResolvedValue({ data: [] }) },
  produitService: { searchFuzzy: vi.fn().mockResolvedValue([]) },
  tiersService: { search: vi.fn().mockResolvedValue([]) },
}));

const auth: { user: { id: number; role: string } } = { user: { id: 1, role: 'manager' } };
vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => auth,
  useOptionalAuth: () => auth,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const facture = {
  id: 3,
  tiers_id: 2,
  commande_id: null,
  reception_id: null,
  numero_facture_fournisseur: 'HP-7781',
  numero_facture_interne: 'FF-2026-00003',
  date_facture: '2026-10-10',
  date_echeance: '2026-01-15',
  total: '900000',
  montant_paye: '300000',
  reste_due: '600000',
  statut: 'partiellement_payee',
  condition_paiement: '30 jours',
  notes: null,
  fournisseur_nom: 'HP Côte d’Ivoire SA',
};

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <FacturesFournisseur />
    </MemoryRouter>
  );
}

describe('Factures fournisseur', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(factureFournisseurService.getAll).mockResolvedValue({
      data: [facture],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(factureFournisseurService.getById).mockResolvedValue({
      ...facture,
      lignes: [
        { id: 1, produit_id: 7, produit_nom: 'Souris USB', produit_reference: 'SOU-01', description: null, quantite: 10, prix_unitaire: '90000', total_ligne: '900000' },
      ],
    });
    vi.mocked(factureFournisseurService.getStats).mockResolvedValue({
      total_factures: '1',
      valeur_totale: '900000',
      reste_du_total: '600000',
      factures_en_attente: '0',
      factures_payees: '0',
    });
  });

  it('opens the invoice from the URL in a side panel with its balance and payment action', async () => {
    auth.user.role = 'manager';
    renderAt('/factures-fournisseur?facture=3');
    expect(await screen.findByRole('dialog', { name: 'Facture FF-2026-00003' })).toBeInTheDocument();
    expect(screen.getAllByText('Reste à payer').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Enregistrer un paiement' })).toBeInTheDocument();
    expect(screen.getAllByText('Échue').length).toBeGreaterThan(0);
  });

  it('keeps the depot read-only: no new invoice, no payment', async () => {
    auth.user.role = 'depot_staff';
    renderAt('/factures-fournisseur?facture=3');
    expect(await screen.findByRole('dialog', { name: 'Facture FF-2026-00003' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nouvelle facture fournisseur/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enregistrer un paiement' })).toBeNull();
  });

  it('keeps the tiles for amounts and puts the server counts in the status chips', async () => {
    auth.user.role = 'manager';
    vi.mocked(factureFournisseurService.getStats).mockResolvedValue({
      total_factures: '4',
      valeur_totale: '13431382',
      reste_du_total: '4864929',
      factures_en_attente: '1',
      factures_payees: '2',
    });
    renderAt('/factures-fournisseur');
    const filters = await screen.findByRole('group', { name: 'Filtrer par statut' });
    const chip = (name: RegExp) => within(filters).getByRole('button', { name });
    // Les décomptes du serveur (4 factures), pas ceux de la page affichée (1 ligne).
    await waitFor(() => expect(chip(/^Toutes/)).toHaveTextContent(/^Toutes\s*4$/));
    expect(chip(/^En attente/)).toHaveTextContent(/^En attente\s*1$/);
    expect(chip(/^Payée/)).toHaveTextContent(/^Payée\s*2$/);
    // Aucun nombre deviné pour un statut que le serveur ne compte pas.
    expect(chip(/^Validée/)).toHaveTextContent(/^Validée$/);
    expect(chip(/^Partiellement payée/)).toHaveTextContent(/^Partiellement payée$/);
    // Deux tuiles, des montants : plus de tuile qui répète une puce.
    expect(screen.queryByText('Payées')).toBeNull();
    const valeur = screen.getByText('Valeur des factures').parentElement as HTMLElement;
    expect(valeur).toHaveTextContent(/13\s431\s382\s*FCFA/);
    const reste = screen.getAllByText('Reste à payer').find((el) => el.tagName === 'P')?.parentElement as HTMLElement;
    expect(reste).toHaveTextContent(/4\s864\s929\s*FCFA/);
  });

  it('opens the creation dialog from the URL for a manager', async () => {
    auth.user.role = 'manager';
    renderAt('/factures-fournisseur?nouvelle=1');
    expect(await screen.findByRole('dialog', { name: 'Nouvelle facture fournisseur' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter une ligne libre' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer la facture' })).toBeInTheDocument();
  });
});
