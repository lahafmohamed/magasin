import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NouvelleFacture from './NouvelleFacture';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigateMock,
}));

vi.mock('../services/api', () => ({
  factureService: { create: vi.fn() },
  ventesService: { getLocations: vi.fn(), searchFuzzy: vi.fn() },
  stockLocationService: { getStockLevels: vi.fn() },
  tiersService: { getComptoir: vi.fn(), getById: vi.fn(), search: vi.fn(), createClient: vi.fn() },
}));

let currentRole = 'admin';
vi.mock('../lib/AuthContext', () => ({
  useOptionalAuth: () => ({
    user: { id: 7, role: currentRole },
    hasRole: (...roles: string[]) => roles.includes(currentRole),
  }),
  useAuth: () => ({
    user: { id: 7, role: currentRole },
    hasRole: (...roles: string[]) => roles.includes(currentRole),
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { factureService, stockLocationService, tiersService, ventesService } from '../services/api';
import { toast } from 'sonner';

const BARCODE = '6001234500017';

const probook = {
  id: 1,
  reference: 'INF-LAP-001',
  nom: 'HP ProBook 450 G10',
  code_barre: BARCODE,
  prix_vente: '595000.00',
  prix_achat: '450000.00',
  stock: 13,
  stock_min: 2,
  similarity: 1,
};

const laserjet = {
  id: 22,
  reference: 'INF-PRT-001',
  nom: 'HP LaserJet Pro M404dn',
  code_barre: '6001234500038',
  prix_vente: '215000.00',
  prix_achat: '165000.00',
  stock: 5,
  stock_min: 1,
  similarity: 0.6,
};

const comptoir = {
  id: 28,
  code: 'PASS',
  raison_sociale: 'Client comptoir',
  prenom: null,
  telephone: null,
  email: null,
  est_client: true,
  est_fournisseur: false,
};

const mocked = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

function renderPage(role = 'admin') {
  currentRole = role;
  return render(
    <MemoryRouter initialEntries={['/factures/nouvelle']}>
      <NouvelleFacture />
    </MemoryRouter>
  );
}

/**
 * Magasins chargés. Un seul magasin : rien à choisir dans la carte Produits,
 * le récapitulatif le nomme (« Emplacement : Hitek Plateau »).
 */
const locationsLoaded = () => screen.findByText('Hitek Plateau');

/** Saisie « douchette » : tous les caractères d'un coup puis Entrée. */
async function scan(user: ReturnType<typeof userEvent.setup>, code: string) {
  const search = screen.getByRole('combobox', { name: 'Ajouter un produit' });
  await user.click(search);
  await user.type(search, `${code}{Enter}`);
}

describe('NouvelleFacture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocked(ventesService.getLocations).mockResolvedValue([
      { id: 1, code: 'MAG-PLT', nom: 'Hitek Plateau', est_principal: true },
    ]);
    mocked(stockLocationService.getStockLevels).mockResolvedValue([
      { produit_id: 1, quantite_disponible: 13 },
      { produit_id: 22, quantite_disponible: 5 },
    ]);
    mocked(ventesService.searchFuzzy).mockImplementation(async (q: string) => {
      if (q === BARCODE) return [probook];
      if (/hp/i.test(q)) return [probook, laserjet];
      return [];
    });
    mocked(tiersService.getComptoir).mockResolvedValue(comptoir);
    mocked(tiersService.getById).mockResolvedValue({ ...comptoir, delai_paiement: 'immediat' });
    mocked(tiersService.search).mockResolvedValue([]);
    mocked(factureService.create).mockResolvedValue({ id: 100, numero_facture: 'FAC-2026-00111', total: 595000 });
  });

  it('affiche le formulaire, le récapitulatif et une seule action principale par largeur', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Nouvelle facture' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Client/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Ajouter un produit' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Récapitulatif' })).toBeInTheDocument();
    // Le bouton reste actif : la validation se fait au clic (jamais « désactivé tant que… »).
    for (const button of screen.getAllByRole('button', { name: 'Créer la facture' })) {
      expect(button).toBeEnabled();
    }
    expect(await locationsLoaded()).toBeInTheDocument();
    // Un seul magasin : pas de liste « Emplacement de vente » entre la consigne et la recherche.
    expect(screen.queryByRole('combobox', { name: 'Emplacement de vente' })).not.toBeInTheDocument();
    expect(screen.queryByText('(MAG-PLT)')).not.toBeInTheDocument();
  });

  it('U-04 : une douchette (code puis Entrée) ajoute le produit sans jamais créer la facture', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage('caissier');
    // Client comptoir présélectionné : client + une ligne = le cas où Entrée créait la facture.
    expect(await screen.findByRole('button', { name: 'Changer de client' })).toBeInTheDocument();
    await locationsLoaded();

    await scan(user, BARCODE);
    const table = await screen.findByRole('table', { name: 'Lignes de la facture' });
    expect(within(table).getByText('HP ProBook 450 G10')).toBeInTheDocument();
    expect(factureService.create).not.toHaveBeenCalled();

    // Deuxième scan du même article : une unité de plus, toujours pas de facture.
    await scan(user, BARCODE);
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Quantité — HP ProBook 450 G10' })).toHaveValue('2')
    );
    expect(factureService.create).not.toHaveBeenCalled();
  });

  it('U-01 : un scan ne fait qu’une seule recherche, pas une par caractère', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await locationsLoaded();

    await scan(user, BARCODE);
    await screen.findByRole('table', { name: 'Lignes de la facture' });
    expect(ventesService.searchFuzzy).toHaveBeenCalledTimes(1);
    expect(ventesService.searchFuzzy).toHaveBeenCalledWith(BARCODE, 20, 1);
  });

  it('U-01 : la recherche au clavier attend une pause de frappe (250 ms) avant de partir', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await locationsLoaded();

    await user.type(screen.getByRole('combobox', { name: 'Ajouter un produit' }), 'HP Pro');
    expect(ventesService.searchFuzzy).not.toHaveBeenCalled();
    expect(await screen.findByRole('option', { name: /HP LaserJet Pro M404dn/ })).toBeInTheDocument();
    expect(ventesService.searchFuzzy).toHaveBeenCalledTimes(1);
    expect(ventesService.searchFuzzy).toHaveBeenCalledWith('HP Pro', 20, 1);
  });

  it('S01 : la liste se parcourt aux flèches et Entrée ajoute l’option active', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await locationsLoaded();

    const search = screen.getByRole('combobox', { name: 'Ajouter un produit' });
    await user.type(search, 'HP');
    await screen.findByRole('option', { name: /HP LaserJet/ });
    await user.keyboard('{ArrowDown}{ArrowDown}');
    const active = screen.getByRole('option', { name: /HP LaserJet/ });
    expect(search).toHaveAttribute('aria-activedescendant', active.id);
    expect(active).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Enter}');
    const table = await screen.findByRole('table', { name: 'Lignes de la facture' });
    expect(within(table).getByText('HP LaserJet Pro M404dn')).toBeInTheDocument();
    expect(factureService.create).not.toHaveBeenCalled();
    expect(search).toHaveFocus();
  });

  it('valide au clic : messages par champ, focus sur le premier champ en erreur, aucune facture', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await locationsLoaded();

    await user.click(screen.getAllByRole('button', { name: 'Créer la facture' })[0]);
    expect(await screen.findByText('Choisissez le client.')).toBeInTheDocument();
    expect(screen.getByText('Ajoutez au moins un produit.')).toBeInTheDocument();
    const clientInput = screen.getByRole('combobox', { name: /Client/ });
    expect(clientInput).toHaveAttribute('aria-invalid', 'true');
    expect(clientInput).toHaveAttribute('aria-describedby', 'facture-client-error');
    await waitFor(() => expect(clientInput).toHaveFocus());
    expect(factureService.create).not.toHaveBeenCalled();
  });

  it('D4 : le client comptoir est présélectionné pour le caissier, et reste modifiable', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage('caissier');
    expect(await screen.findByRole('button', { name: 'Changer de client' })).toBeInTheDocument();
    // Dans le sélecteur et dans le récapitulatif.
    expect(screen.getAllByText('Client comptoir')).toHaveLength(2);
    expect(screen.getByText(/Vente au comptoir/)).toBeInTheDocument();
    expect(tiersService.getComptoir).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Changer de client' }));
    const clientInput = screen.getByRole('combobox', { name: /Client/ });
    expect(clientInput).toHaveFocus();
    expect(screen.queryByText(/Vente au comptoir/)).not.toBeInTheDocument();
  });

  it('P-M5 : client comptoir choisi, la douchette part dans « Ajouter un produit »', async () => {
    renderPage('caissier');
    await screen.findByRole('button', { name: 'Changer de client' });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Ajouter un produit' })).toHaveFocus());
  });

  it('P-M5 : Ctrl + Entrée crée la facture depuis la recherche produit, sans la souris', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage('caissier');
    await screen.findByRole('button', { name: 'Changer de client' });
    await locationsLoaded();
    await scan(user, BARCODE);
    await screen.findByRole('table', { name: 'Lignes de la facture' });

    // Le raccourci est annoncé sur l'action.
    for (const button of screen.getAllByRole('button', { name: 'Créer la facture' })) {
      expect(button).toHaveAttribute('aria-keyshortcuts', 'Control+Enter');
    }

    // Le focus est resté dans la recherche : Entrée seule n'y crée jamais la facture…
    const search = screen.getByRole('combobox', { name: 'Ajouter un produit' });
    expect(search).toHaveFocus();
    await user.keyboard('{Control>}{Enter}{/Control}');

    // … mais Ctrl + Entrée, oui.
    await waitFor(() => expect(factureService.create).toHaveBeenCalledTimes(1));
    expect(factureService.create).toHaveBeenCalledWith(
      expect.objectContaining({ tiers_id: 28, lignes: [{ produit_id: 1, quantite: 1, prix_unitaire: 595000 }] })
    );
  });

  it('D4 : pas de présélection pour un autre rôle', async () => {
    renderPage('manager');
    await locationsLoaded();
    expect(tiersService.getComptoir).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: /Client/ })).toHaveValue('');
  });

  it('U-15 : après création, ouvre la facture créée (paiement proposé par la fiche)', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage('caissier');
    await screen.findByRole('button', { name: 'Changer de client' });
    await locationsLoaded();
    await scan(user, BARCODE);
    await screen.findByRole('table', { name: 'Lignes de la facture' });

    await user.click(screen.getAllByRole('button', { name: 'Créer la facture' })[0]);

    await waitFor(() => expect(factureService.create).toHaveBeenCalledTimes(1));
    expect(factureService.create).toHaveBeenCalledWith({
      tiers_id: 28,
      location_id: 1,
      lignes: [{ produit_id: 1, quantite: 1, prix_unitaire: 595000 }],
      notes: undefined,
    });
    expect(toast.success).toHaveBeenCalledWith('Facture FAC-2026-00111 créée');
    expect(navigateMock).toHaveBeenCalledWith('/factures/100', { replace: true, state: { justCreated: true } });
  });

  it('refuse une quantité supérieure au stock de l’emplacement, sous la ligne concernée', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage('caissier');
    await screen.findByRole('button', { name: 'Changer de client' });
    await locationsLoaded();
    await scan(user, BARCODE);
    const qty = await screen.findByRole('textbox', { name: 'Quantité — HP ProBook 450 G10' });
    await user.clear(qty);
    await user.type(qty, '20');

    await user.click(screen.getAllByRole('button', { name: 'Créer la facture' })[0]);
    expect(
      await screen.findByText('Stock insuffisant : 13 disponibles dans cet emplacement.', { selector: '[role="alert"]' })
    ).toBeInTheDocument();
    await waitFor(() => expect(qty).toHaveFocus());
    expect(factureService.create).not.toHaveBeenCalled();
  });

  it('U-26 : prix de revient et marge réservés au gérant ; le caissier voit seulement l’alerte', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage('caissier');
    await screen.findByRole('button', { name: 'Changer de client' });
    await locationsLoaded();
    await scan(user, BARCODE);
    await screen.findByRole('table', { name: 'Lignes de la facture' });
    expect(screen.queryByText('Marge brute')).not.toBeInTheDocument();
    expect(screen.queryByText(/Prix de revient/)).not.toBeInTheDocument();

    const prix = screen.getByRole('textbox', { name: 'Prix unitaire — HP ProBook 450 G10' });
    await user.clear(prix);
    await user.type(prix, '400000');
    expect(
      screen.getByText('Prix inférieur au prix de revient : demandez l’accord d’un gérant avant d’enregistrer.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/450\s000/)).not.toBeInTheDocument();
  });

  it('U-26 : le gérant voit la marge brute', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage('manager');
    await locationsLoaded();
    await scan(user, BARCODE);
    await screen.findByRole('table', { name: 'Lignes de la facture' });
    expect(screen.getByText('Marge brute')).toBeInTheDocument();
    // Sous le prix de la ligne et dans le récapitulatif.
    expect(screen.getAllByText(/Prix de revient/).length).toBeGreaterThanOrEqual(2);
  });

  it('sur téléphone, chaque ligne devient une carte (pas de tableau qui défile)', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      const user = userEvent.setup({ delay: null });
      renderPage();
      await locationsLoaded();
      await scan(user, BARCODE);
      const list = await screen.findByRole('list', { name: 'Lignes de la facture' });
      expect(within(list).getByText('HP ProBook 450 G10')).toBeInTheDocument();
      expect(within(list).getByRole('textbox', { name: 'Quantité — HP ProBook 450 G10' })).toBeInTheDocument();
      expect(screen.queryByRole('table', { name: 'Lignes de la facture' })).not.toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });

  it('S02 : chaque champ de ligne est nommé avec le produit, avec le bon clavier mobile', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await locationsLoaded();
    await scan(user, BARCODE);
    await screen.findByRole('table', { name: 'Lignes de la facture' });

    expect(screen.getByRole('textbox', { name: 'Quantité — HP ProBook 450 G10' })).toHaveAttribute(
      'inputmode',
      'numeric'
    );
    expect(screen.getByRole('textbox', { name: 'Prix unitaire — HP ProBook 450 G10' })).toHaveAttribute(
      'inputmode',
      'decimal'
    );
    expect(screen.getByRole('textbox', { name: 'Remise en % — HP ProBook 450 G10' })).toHaveAttribute(
      'inputmode',
      'decimal'
    );
    expect(screen.getByRole('button', { name: 'Augmenter la quantité — HP ProBook 450 G10' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer HP ProBook 450 G10 de la facture' })).toBeInTheDocument();
  });
});
