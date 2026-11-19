import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NouvelAvoir from './NouvelAvoir';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigateMock,
}));

vi.mock('../services/api', () => ({
  creditNoteService: { createManual: vi.fn() },
  factureService: { getAll: vi.fn(), getById: vi.fn() },
  retourService: { getById: vi.fn() },
  tiersService: { getById: vi.fn(), search: vi.fn(), createClient: vi.fn() },
}));

vi.mock('../lib/AuthContext', () => ({
  useOptionalAuth: () => ({ user: { id: 1, role: 'manager' }, hasRole: (...r: string[]) => r.includes('manager') }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { creditNoteService, factureService, retourService, tiersService } from '../services/api';
import { toast } from 'sonner';

const mocked = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const client = {
  id: 12,
  code: 'CLI-0012',
  raison_sociale: 'Hôtel Ivoire Lagune',
  prenom: null,
  telephone: '2720000000',
  email: null,
  est_client: true,
  est_fournisseur: false,
};

const facture = {
  id: 110,
  numero_facture: 'FAC-2026-00110',
  tiers_id: 12,
  client_nom: 'Hôtel Ivoire Lagune',
  client_prenom: null,
  date_facture: '2026-10-20',
  total: 669000,
  statut: 'payee',
};

const retour = {
  id: 2,
  numero_retour: 'RET-2026-00002',
  tiers_id: 12,
  statut: 'traite',
  avoir_id: null,
  numero_avoir: null,
  lignes: [
    {
      facture_id: 110,
      produit_id: 1,
      produit_nom: 'HP ProBook 450 G10',
      produit_reference: 'INF-LAP-001',
      quantite: 1,
      prix_unitaire: '595000.00',
    },
  ],
};

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <NouvelAvoir />
    </MemoryRouter>
  );
}

describe('NouvelAvoir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocked(factureService.getById).mockResolvedValue(facture);
    mocked(tiersService.getById).mockResolvedValue(client);
    mocked(retourService.getById).mockResolvedValue(retour);
    mocked(creditNoteService.createManual).mockResolvedValue({ avoir_id: 7, numero_avoir: 'AVOIR-2026-00007' });
  });

  it('?retour_id= : facture, client, produits et motif « Retour marchandise » repris du retour', async () => {
    const user = userEvent.setup({ delay: null });
    renderAt('/avoirs/nouveau?retour_id=2');

    // La ligne vide initiale est remplacée par celle du retour une fois chargé.
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Description — ligne 1' })).toHaveValue(
        'HP ProBook 450 G10 (INF-LAP-001)'
      )
    );
    expect(screen.getByText(/Avoir du retour/)).toHaveTextContent('RET-2026-00002');
    expect(screen.getAllByText('FAC-2026-00110').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Hôtel Ivoire Lagune').length).toBeGreaterThan(0);
    expect(screen.getByRole('radio', { name: 'Retour marchandise' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('textbox', { name: 'Prix unitaire — HP ProBook 450 G10 (INF-LAP-001)' })).toHaveValue(
      `595${' '}000`
    );

    await user.click(screen.getAllByRole('button', { name: 'Créer l’avoir' })[0]);
    await waitFor(() => expect(creditNoteService.createManual).toHaveBeenCalledTimes(1));
    expect(creditNoteService.createManual).toHaveBeenCalledWith({
      tiers_id: 12,
      facture_origine_id: 110,
      lignes: [{ produit_id: 1, description: 'HP ProBook 450 G10 (INF-LAP-001)', quantite: 1, prix_unitaire: 595000 }],
      notes: undefined,
      avoir_type: 'retour',
      retour_id: 2,
    });
    expect(toast.success).toHaveBeenCalledWith('Avoir AVOIR-2026-00007 créé');
    expect(navigateMock).toHaveBeenCalledWith('/avoirs/7', { replace: true, state: { justCreated: true } });
  });

  it('?retour_id= d’un retour qui a déjà son avoir : le dit et renvoie vers cet avoir', async () => {
    mocked(retourService.getById).mockResolvedValue({ ...retour, avoir_id: 2, numero_avoir: 'AVOIR-2026-00002' });
    renderAt('/avoirs/nouveau?retour_id=2');
    expect(await screen.findByRole('link', { name: 'voir l’avoir AVOIR-2026-00002' })).toHaveAttribute(
      'href',
      '/avoirs/2'
    );
  });

  it('?retour_id= d’un retour non approuvé : avertit avant toute saisie', async () => {
    mocked(retourService.getById).mockResolvedValue({ ...retour, statut: 'en_attente' });
    renderAt('/avoirs/nouveau?retour_id=2');
    expect(await screen.findByText(/n’est pas encore approuvé/)).toBeInTheDocument();
  });

  it('?facture_id= : facture d’origine et client préremplis', async () => {
    renderAt('/avoirs/nouveau?facture_id=110');
    expect(await screen.findByRole('button', { name: 'Changer de facture' })).toBeInTheDocument();
    expect(screen.getAllByText('FAC-2026-00110').length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getAllByText('Hôtel Ivoire Lagune').length).toBeGreaterThan(0));
    expect(tiersService.getById).toHaveBeenCalledWith(12);
  });

  it('valide au clic : facture d’origine et lignes obligatoires, aucun envoi', async () => {
    const user = userEvent.setup({ delay: null });
    renderAt('/avoirs/nouveau');
    await user.click(screen.getAllByRole('button', { name: 'Créer l’avoir' })[0]);
    expect(await screen.findByText('Choisissez la facture d’origine.')).toBeInTheDocument();
    expect(screen.getByText('Décrivez la ligne : produit ou motif.')).toBeInTheDocument();
    expect(screen.getByText('Saisissez un prix supérieur à 0.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /Facture d’origine/ })).toHaveFocus()
    );
    expect(creditNoteService.createManual).not.toHaveBeenCalled();
  });
});
