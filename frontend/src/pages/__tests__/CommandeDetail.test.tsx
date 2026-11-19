import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CommandeDetail from '../CommandeDetail';
import { commandeService } from '../../services/api';

vi.mock('../../services/api', () => ({
  commandeService: {
    getById: vi.fn(),
    getMatch: vi.fn(),
    updateStatut: vi.fn(),
    update: vi.fn(),
    downloadPdf: vi.fn(),
  },
  produitService: { searchFuzzy: vi.fn().mockResolvedValue([]), getAll: vi.fn(), create: vi.fn() },
  tiersService: { search: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../components/AttachmentPanel', () => ({ AttachmentPanel: () => null }));

const auth = { user: { id: 1, role: 'manager' } };
vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => auth,
  useOptionalAuth: () => auth,
}));

vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => vi.fn().mockResolvedValue(true) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const commande = (statut: string) => ({
  id: 6,
  numero_commande: 'CMD-2026-00006',
  tiers_id: 2,
  fournisseur_nom: 'HP Côte d’Ivoire SA',
  fournisseur_telephone: '+225 27 20 00 00',
  fournisseur_email: null,
  date_commande: '2026-10-19',
  date_livraison_prevue: '2099-10-26',
  statut,
  sous_total: '1034090',
  notes: null,
  lignes: [
    { id: 11, produit_id: 7, produit_nom: 'Souris USB', produit_reference: 'SOU-01', quantite: 10, prix_unitaire: '5000', total_ligne: '50000' },
  ],
});

const match = {
  coherent: false,
  within_tolerance: true,
  config: { bloquer: false },
  violations: [],
  lignes: [
    { produit_id: 7, produit_nom: 'Souris USB', reference: 'SOU-01', qte_commandee: 10, qte_recue: 4, qte_facturee: 0, prix_commande: 5000, prix_facture: null, coherent: true, within_tolerance: true },
  ],
};

function renderAt(id = '6') {
  return render(
    <MemoryRouter initialEntries={[`/commandes/${id}`]}>
      <Routes>
        <Route path="/commandes/:id" element={<CommandeDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('CommandeDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(commandeService.getMatch).mockResolvedValue(match);
  });

  it('makes the reception the single primary step of a validated order', async () => {
    const user = userEvent.setup();
    vi.mocked(commandeService.getById).mockResolvedValue(commande('validee'));
    renderAt();
    expect(await screen.findByRole('heading', { level: 1, name: /Commande CMD-2026-00006/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Réceptionner la commande/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Marquer comme expédiée/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Valider la commande/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Modifier la commande/ })).toBeNull();
    // Plus d'impression navigateur : le bon de commande est le PDF du serveur,
    // rangé dans « Plus d’actions » comme dans la liste.
    expect(screen.queryByRole('button', { name: /^Imprimer$/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Télécharger le bon de commande' }));
    expect(commandeService.downloadPdf).toHaveBeenCalledWith(6, 'CMD-2026-00006');
    expect(document.querySelector('style')?.textContent ?? '').not.toMatch(/visibility:\s*hidden/);
  });

  it('gathers contact and delivery in one card, without repeating the header or the total', async () => {
    vi.mocked(commandeService.getById).mockResolvedValue({
      ...commande('livree'),
      fournisseur_email: 'commercial@hp-ci.example',
      date_livraison_prevue: '2026-10-26',
      date_livraison_reelle: '2026-10-25',
    });
    renderAt();
    const card = (await screen.findByRole('heading', { level: 2, name: 'Fournisseur et livraison' })).closest(
      '.rounded-lg'
    ) as HTMLElement;
    expect(within(card).getByText('Téléphone')).toBeInTheDocument();
    expect(within(card).getByText('+225 27 20 00 00')).toBeInTheDocument();
    expect(within(card).getByText('commercial@hp-ci.example')).toBeInTheDocument();
    expect(within(card).getByText('Livraison prévue')).toBeInTheDocument();
    expect(within(card).getByText('Livraison effective')).toBeInTheDocument();
    // Numéro (titre), date de commande et fournisseur (sous-titre), total
    // (sous les produits) : une seule fois chacun à l'écran.
    expect(screen.queryByRole('heading', { name: 'Informations de la commande' })).toBeNull();
    expect(within(card).queryByText('Numéro')).toBeNull();
    expect(within(card).queryByText('Date de commande')).toBeNull();
    expect(within(card).queryByText('Total')).toBeNull();
    expect(within(card).queryByText('Nom')).toBeNull();
    expect(screen.getAllByText(/HP Côte d’Ivoire SA/)).toHaveLength(1);
  });

  it('titles the card « Livraison » when the supplier has no contact on file', async () => {
    vi.mocked(commandeService.getById).mockResolvedValue({ ...commande('validee'), fournisseur_telephone: null });
    renderAt();
    expect(await screen.findByRole('heading', { level: 2, name: 'Livraison' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Fournisseur et livraison' })).toBeNull();
    expect(screen.getByText('Livraison prévue')).toBeInTheDocument();
  });

  it('lets a pending order be validated or edited', async () => {
    vi.mocked(commandeService.getById).mockResolvedValue(commande('en_attente'));
    renderAt();
    expect(await screen.findByRole('button', { name: /Valider la commande/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Modifier la commande/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Réceptionner la commande/ })).toBeNull();
  });

  it('keeps the page when the 3-way check fails, with its own retry', async () => {
    vi.mocked(commandeService.getById).mockResolvedValue(commande('validee'));
    vi.mocked(commandeService.getMatch).mockRejectedValue(new Error('réseau'));
    renderAt();
    expect(await screen.findByText('Impossible de charger le contrôle de la commande')).toBeInTheDocument();
    expect(screen.getAllByText('Souris USB').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  /** Une ligne du contrôle 3 voies (Souris USB, 10 commandées à 5 000). */
  const matchWith = (qte_recue: number, qte_facturee: number, prix_facture: number | null = null) => ({
    coherent: true,
    within_tolerance: true,
    config: { bloquer: false },
    violations: [],
    lignes: [
      {
        produit_id: 7,
        produit_nom: 'Souris USB',
        reference: 'SOU-01',
        qte_commandee: 10,
        qte_recue,
        qte_facturee,
        prix_commande: 5000,
        prix_facture,
        coherent: true,
        within_tolerance: true,
      },
    ],
  });

  it('never calls a pending order « Conforme » (GV-10)', async () => {
    vi.mocked(commandeService.getById).mockResolvedValue(commande('en_attente'));
    vi.mocked(commandeService.getMatch).mockResolvedValue(matchWith(0, 0));
    renderAt();
    expect(await screen.findByText('Rien n’a encore été reçu ni facturé')).toBeInTheDocument();
    expect(screen.getAllByText('À recevoir').length).toBeGreaterThan(0);
    expect(screen.queryByText('Conforme')).toBeNull();
    expect(screen.queryByText(/concordent/)).toBeNull();
  });

  it('shows a received but uninvoiced order as « À facturer », not reconciled', async () => {
    vi.mocked(commandeService.getById).mockResolvedValue(commande('livree'));
    vi.mocked(commandeService.getMatch).mockResolvedValue(matchWith(10, 0));
    renderAt();
    expect(await screen.findByText(/Tout est reçu : 1 produit reste à facturer/)).toBeInTheDocument();
    expect(screen.getAllByText('À facturer').length).toBeGreaterThan(0);
    expect(screen.queryByText('Conforme')).toBeNull();
    expect(screen.queryByText(/concordent/)).toBeNull();
  });

  it('keeps the green reconciliation for a fully received and invoiced order', async () => {
    vi.mocked(commandeService.getById).mockResolvedValue(commande('livree'));
    vi.mocked(commandeService.getMatch).mockResolvedValue(matchWith(10, 10, 5000));
    renderAt();
    expect(await screen.findByText('Commande, réceptions et facture concordent')).toBeInTheDocument();
    expect(screen.getAllByText('Conforme').length).toBeGreaterThan(0);
    expect(screen.queryByText('À recevoir')).toBeNull();
  });

  it('reports a partial reception with what remains to receive', async () => {
    vi.mocked(commandeService.getById).mockResolvedValue(commande('validee'));
    renderAt();
    expect(await screen.findByText('Réception partielle : 1 produit reste à recevoir')).toBeInTheDocument();
    expect(screen.queryByText('Conforme')).toBeNull();
  });

  it('says the order is missing instead of showing a blank page', async () => {
    vi.mocked(commandeService.getById).mockRejectedValue({ response: { status: 404 } });
    renderAt('999');
    expect(await screen.findAllByText('Commande introuvable')).not.toHaveLength(0);
  });
});
