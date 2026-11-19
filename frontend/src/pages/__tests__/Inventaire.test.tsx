import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Inventaire from '../Inventaire';

const auth = vi.hoisted(() => ({ role: 'admin' }));

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'test', role: auth.role } }),
  useOptionalAuth: () => ({ user: { id: 1, username: 'test', role: auth.role } }),
}));

vi.mock('../../services/api', () => ({
  produitService: {
    addStockMovement: vi.fn(),
    getById: vi.fn(),
    getAll: vi.fn(),
    getStockByCategory: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    getStockHistory: vi.fn(),
    getPurchaseInfo: vi.fn(),
  },
  stockLocationService: { getAll: vi.fn(), getStockLevels: vi.fn() },
  caisseService: { getMagasins: vi.fn() },
  tiersService: { getAll: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const confirmMock = vi.fn();
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => confirmMock }));

import { caisseService, produitService, stockLocationService, tiersService } from '../../services/api';

const LOCATIONS = [
  { id: 1, code: 'DEP-VRD', nom: 'Dépôt Vridi', actif: true, est_principal: true, location_type: 'depot' },
  { id: 2, code: 'MAG-PLT', nom: 'Hitek Plateau', actif: true, est_principal: false, location_type: 'magasin' },
];

const PRODUITS = [
  {
    id: 10,
    reference: 'CLV-001',
    nom: 'Clavier USB',
    code_barre: null,
    description: null,
    categorie: 'Périphériques',
    prix_achat: '5000.00',
    prix_vente: '8000.00',
    stock: 4,
    stock_min: 5,
  },
];

const renderPage = (url = '/inventaire') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Inventaire />
    </MemoryRouter>
  );

describe('Inventaire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.role = 'admin';
    vi.mocked(stockLocationService.getAll).mockResolvedValue(LOCATIONS);
    vi.mocked(produitService.getAll).mockResolvedValue({
      data: PRODUITS,
      pagination: { total: 1, totalPages: 1 },
    });
    vi.mocked(produitService.getStockByCategory).mockResolvedValue([{ categorie: 'Périphériques' }]);
    vi.mocked(caisseService.getMagasins).mockResolvedValue([{ id: 7, location_id: 2, nom: 'Hitek Plateau' }]);
    vi.mocked(stockLocationService.getStockLevels).mockResolvedValue([{ produit_id: 10, quantite: 4 }]);
    vi.mocked(produitService.addStockMovement).mockResolvedValue({ stock: 2 });
  });

  it('shows stock, low-stock words and the cost column to a manager', async () => {
    auth.role = 'manager';
    renderPage();

    await waitFor(() => expect(screen.getAllByText('Clavier USB').length).toBeGreaterThan(0));
    expect(screen.getByRole('button', { name: /Nouveau produit/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Marge' })).toBeInTheDocument();
    // Stock 4 ≤ stock minimum 5 : le mot, pas seulement la couleur.
    expect(screen.getAllByText('Stock bas').length).toBeGreaterThan(0);
    // Responsable : vue « Tous les emplacements » par défaut.
    expect(vi.mocked(produitService.getAll).mock.calls[0][7]).toBeUndefined();
  });

  it('hides write controls and costs from shop staff and opens on their own shop', async () => {
    auth.role = 'magasin_staff';
    renderPage();

    await waitFor(() => expect(screen.getAllByText('Clavier USB').length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: /Nouveau produit/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sélectionner Clavier USB')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Marge' })).not.toBeInTheDocument();
    // Emplacement par défaut = le magasin de la caisse (location 2).
    const calls = vi.mocked(produitService.getAll).mock.calls;
    expect(calls[calls.length - 1]?.[7]).toBe(2);
  });

  it('previews the adjustment, blocks a withdrawal beyond stock and requires a motif', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getAllByLabelText('Sélectionner Clavier USB').length).toBeGreaterThan(0));
    await user.click(screen.getAllByLabelText('Sélectionner Clavier USB')[0]);
    await user.click(screen.getByRole('button', { name: 'Ajuster le stock' }));

    const dialog = await screen.findByRole('dialog');
    // Stock lu à l'emplacement choisi (le principal : la liste montre tous les emplacements).
    await waitFor(() => expect(stockLocationService.getStockLevels).toHaveBeenCalledWith(1));

    await user.click(within(dialog).getByRole('radio', { name: /Retirer/ }));
    await user.type(within(dialog).getByLabelText(/Quantité à retirer/), '10');
    expect(await within(dialog).findByText('Seulement 4 en stock')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/Motif/), 'Casse');
    await user.click(within(dialog).getByRole('button', { name: 'Ajuster le stock' }));
    expect(await within(dialog).findByText(/rendrait le stock de « Clavier USB » négatif/)).toBeInTheDocument();
    expect(produitService.addStockMovement).not.toHaveBeenCalled();

    // Quantité correcte mais motif vidé : le motif est obligatoire.
    await user.clear(within(dialog).getByLabelText(/Quantité à retirer/));
    await user.type(within(dialog).getByLabelText(/Quantité à retirer/), '2');
    await user.clear(within(dialog).getByLabelText(/Motif/));
    await user.click(within(dialog).getByRole('button', { name: 'Ajuster le stock' }));
    expect(await within(dialog).findByText(/Indiquez le motif/)).toBeInTheDocument();
    expect(produitService.addStockMovement).not.toHaveBeenCalled();

    // Aperçu 4 → 2, puis mouvement tracé avec son motif.
    expect(within(dialog).getByText('Clavier USB').closest('li')).toHaveTextContent(/4.*2/);
    await user.type(within(dialog).getByLabelText(/Motif/), 'Casse en rayon');
    await user.click(within(dialog).getByRole('button', { name: 'Ajuster le stock' }));

    await waitFor(() =>
      expect(produitService.addStockMovement).toHaveBeenCalledWith(10, {
        type_mouvement: 'ajustement',
        quantite: -2,
        location_id: 1,
        raison: 'Casse en rayon',
      })
    );
    // Parcours complet au clavier (une trentaine de frappes) : sous la charge de
    // la suite entière il dépasse le délai par défaut de 5 s.
  }, 20_000);

  it('opens filtered on the location and low stock carried by a dashboard link', async () => {
    auth.role = 'manager';
    renderPage('/inventaire?low_stock=true&location_id=1');

    await waitFor(() => {
      const calls = vi.mocked(produitService.getAll).mock.calls;
      const last = calls[calls.length - 1];
      expect(last?.[2]).toBe(true); // stock bas
      expect(last?.[7]).toBe(1); // Dépôt Vridi
    });
    expect(screen.getByRole('button', { name: /Stock bas/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the error state instead of an empty catalogue when loading fails', async () => {
    vi.mocked(produitService.getAll).mockRejectedValue(new Error('réseau'));
    renderPage();

    expect(await screen.findByText('Impossible de charger les produits')).toBeInTheDocument();
    expect(screen.queryByText('Aucun produit dans le catalogue')).not.toBeInTheDocument();
  });

  it('shows the depot quantities only: no sale price, no purchase info (E2)', async () => {
    auth.role = 'depot_staff';
    renderPage();

    await waitFor(() => expect(screen.getAllByText('Clavier USB').length).toBeGreaterThan(0));
    expect(screen.queryByRole('columnheader', { name: /Prix de vente/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Prix de vente')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Marge' })).not.toBeInTheDocument();
    expect((document.body.textContent ?? '').replace(/[\u00A0\u202F]/g, ' ')).not.toMatch(/FCFA|8 000/);
    // La référence n'ouvre plus « Informations d’achat » (prix d'achat, meilleur client).
    expect(screen.queryByRole('button', { name: /informations d’achat/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Produits et niveaux de stock/)).toBeInTheDocument();
    // Créer un produit, c'est fixer son prix : réservé aux responsables (E2).
    expect(screen.queryByRole('button', { name: /Nouveau produit/ })).not.toBeInTheDocument();
    // Il garde ses actions de stock.
    expect(screen.getAllByRole('button', { name: 'Actions pour Clavier USB' }).length).toBeGreaterThan(0);
  });

  it('keeps sale prices for shop staff and purchase info for a manager', async () => {
    auth.role = 'manager';
    renderPage();
    await waitFor(() => expect(screen.getAllByText('Clavier USB').length).toBeGreaterThan(0));
    expect(screen.getByRole('columnheader', { name: /Prix de vente/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /informations d’achat/i }).length).toBeGreaterThan(0);
  });

  it('never shows nor sends prices in the depot product form', async () => {
    const user = userEvent.setup();
    auth.role = 'depot_staff';
    vi.mocked(produitService.update).mockResolvedValue(undefined);
    vi.mocked(produitService.getById).mockResolvedValue({
      ...PRODUITS[0],
      prix_achat: 5000,
      prix_vente: 8000,
      fournisseur_id: null,
    } as unknown as Awaited<ReturnType<typeof produitService.getById>>);
    vi.mocked(tiersService.getAll).mockResolvedValue([]);
    renderPage();

    await waitFor(() => expect(screen.getAllByText('Clavier USB').length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole('button', { name: 'Actions pour Clavier USB' })[0]);
    await user.click(await screen.findByRole('menuitem', { name: /Modifier le produit/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText(/Prix de vente/)).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Prix d’achat/)).not.toBeInTheDocument();
    expect(within(dialog).getByText(/Les prix sont fixés par un gérant/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /Enregistrer/ }));
    await waitFor(() => expect(produitService.update).toHaveBeenCalled());
    const payload = vi.mocked(produitService.update).mock.calls[0][1] as Record<string, unknown>;
    // L'API peut masquer les prix au dépôt : renvoyer 0 effacerait le vrai prix.
    expect(payload).not.toHaveProperty('prix_vente');
    expect(payload).not.toHaveProperty('prix_achat');
  });

  it('says « Non stocké ici » for a product never stocked at the chosen location', async () => {
    auth.role = 'depot_staff';
    vi.mocked(produitService.getAll).mockResolvedValue({
      data: [
        { ...PRODUITS[0], stock: 0, stocke_ici: false },
        { ...PRODUITS[0], id: 11, reference: 'SOU-001', nom: 'Souris sans fil', stock: 0, stocke_ici: true },
      ],
      pagination: { total: 2, totalPages: 1 },
    });
    renderPage('/inventaire?location_id=1');

    await waitFor(() => expect(screen.getAllByText('Clavier USB').length).toBeGreaterThan(0));
    const row = (name: string) => screen.getAllByText(name)[0].closest('tr') as HTMLElement;
    expect(within(row('Clavier USB')).getByText('Non stocké ici')).toBeInTheDocument();
    expect(within(row('Clavier USB')).queryByText('Rupture')).not.toBeInTheDocument();
    // Stocké ici et à zéro : c'est bien une rupture.
    expect(within(row('Souris sans fil')).getByText('Rupture')).toBeInTheDocument();
  });
});
