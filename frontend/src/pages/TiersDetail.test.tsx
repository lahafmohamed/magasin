import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TiersDetail from './TiersDetail';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { tiersService } from '../services/api';

vi.mock('../services/api', () => ({
  tiersService: {
    getCompte: vi.fn(),
    getCompensations: vi.fn().mockResolvedValue([]),
    recomputeAllocation: vi.fn(),
    recordAcompteClient: vi.fn(),
    recordAcompteFournisseur: vi.fn(),
    createCompensation: vi.fn(),
    downloadRelevePdf: vi.fn(),
  },
  acompteService: { listForClient: vi.fn().mockResolvedValue([]), refund: vi.fn() },
  acompteFournisseurService: { listForFournisseur: vi.fn().mockResolvedValue([]), refund: vi.fn() },
  crmService: {
    getInteractions: vi.fn().mockResolvedValue([]),
    getTaches: vi.fn().mockResolvedValue([]),
    createInteraction: vi.fn(),
    deleteInteraction: vi.fn(),
    createTache: vi.fn(),
    updateTacheStatut: vi.fn(),
    deleteTache: vi.fn(),
  },
  caisseService: { getMagasins: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'manager' }, hasRole: (...roles: string[]) => roles.includes('manager') }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const COMPTE_MIXTE = {
  tiers: {
    id: 5,
    code: 'MIX-001',
    raison_sociale: 'CompuServices SARL',
    prenom: null,
    telephone: '+225 27 20 99 00 99',
    email: null,
    adresse: null,
    nif: null,
    rccm: null,
    est_client: true,
    est_fournisseur: true,
    credit_max: '2500000',
  },
  totaux: {
    client: { total_facture: 3140500, total_paye: 762720, total_avoir: 0, total_acompte: 0, solde_client: 2377780 },
    fournisseur: { total_facture_fourn: 969640, total_paye_fourn: 368463, total_acompte_fourn: 0, solde_fournisseur: 601177 },
    solde_net: 1776603,
  },
  mouvements: [
    { date: '2026-09-26', type: 'facture_client', reference: 'FAC-2026-00010', libelle: 'Facture', debit: 2267500, credit: 0, document_id: 10, role: 'Client' },
  ],
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ConfirmProvider>
        <Routes>
          <Route path="/tiers/:id" element={<TiersDetail />} />
        </Routes>
      </ConfirmProvider>
    </MemoryRouter>
  );
}

describe('TiersDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('states who owes whom in words, with neutral amounts (P32)', async () => {
    vi.mocked(tiersService.getCompte).mockResolvedValue(COMPTE_MIXTE);
    renderAt('/tiers/5');
    await screen.findByRole('heading', { level: 1, name: 'CompuServices SARL' });

    // Tuile = label (dans sa rangée) → contenu de la carte, qui porte valeur et sens.
    const tile = (label: string) => screen.getByText(label).parentElement?.parentElement as HTMLElement;
    expect(tile('Solde client')).toHaveTextContent('Il vous doit');
    expect(tile('Solde fournisseur')).toHaveTextContent('Vous lui devez');
    expect(tile('Solde net')).toHaveTextContent('Il vous doit');
    // Aucune couleur de statut sur un solde : le sens est porté par les mots.
    const grid = screen.getByText('Solde client').closest('.grid') as HTMLElement;
    expect(grid.querySelector('[class*="text-success-"], [class*="text-danger-"], [class*="text-warning-"]')).toBeNull();
  });

  it('offers « Compenser » as the default primary action, not a categorical fill (P33)', async () => {
    vi.mocked(tiersService.getCompte).mockResolvedValue(COMPTE_MIXTE);
    renderAt('/tiers/5');
    const compenser = await screen.findByRole('button', { name: 'Compenser' });
    expect(compenser.className).toContain('bg-primary');
    expect(compenser.className).not.toContain('chart-4');
  });

  it('links an invoice of the statement to its page', async () => {
    vi.mocked(tiersService.getCompte).mockResolvedValue(COMPTE_MIXTE);
    renderAt('/tiers/5');
    const table = await screen.findByRole('table', { name: 'Relevé de compte' });
    expect(within(table).getByRole('link', { name: 'Ouvrir la facture FAC-2026-00010' })).toHaveAttribute('href', '/factures/10');
  });

  it('keeps the statement in one card: title, download and period on top, the table and its pagination below', async () => {
    // 30 mouvements : plus d'une page de 25, la pagination s'affiche.
    const mouvements = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
      type: 'facture_client',
      reference: `FAC-2026-${String(i + 1).padStart(5, '0')}`,
      libelle: 'Facture',
      debit: 10000,
      credit: 0,
      document_id: i + 1,
      role: 'Client',
    }));
    vi.mocked(tiersService.getCompte).mockResolvedValue({ ...COMPTE_MIXTE, mouvements });
    renderAt('/tiers/5');

    const table = await screen.findByRole('table', { name: 'Relevé de compte' });
    const section = screen.getByRole('region', { name: 'Relevé de compte' });
    // Une seule carte dans la section (deux boîtes empilées avant).
    const cards = Array.from(section.children);
    expect(cards).toHaveLength(1);
    const card = cards[0] as HTMLElement;

    expect(within(card).getByRole('button', { name: /Télécharger le relevé/ })).toBeInTheDocument();
    expect(within(card).getByLabelText('Du')).toBeInTheDocument();
    expect(within(card).getByLabelText('Au')).toBeInTheDocument();
    expect(card).toContainElement(table);
    // Le tableau, sous un trait, dans le corps de la carte ; la pagination dedans aussi.
    const body = table.closest('.p-0') as HTMLElement;
    expect(body.className).toContain('border-t');
    expect(within(card).getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
    expect(within(card).getByText(/Page 1 sur 2/)).toBeInTheDocument();
  });

  it('says the contact does not exist instead of an empty page', async () => {
    vi.mocked(tiersService.getCompte).mockRejectedValue({ response: { status: 404, data: { error: 'Contact introuvable' } } });
    renderAt('/tiers/999');
    expect(await screen.findByText('Contact introuvable')).toBeInTheDocument();
    expect(screen.getByText('Ce contact n’existe pas ou a été supprimé')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retour aux contacts' })).toHaveAttribute('href', '/tiers');
  });
});
