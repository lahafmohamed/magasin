import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import InventairePhysiqueDetail from './InventairePhysiqueDetail';
import { ConfirmProvider } from '../components/ui/confirm-dialog';

vi.mock('../services/api', () => ({
  inventaireService: {
    getById: vi.fn(),
    getLignes: vi.fn(),
    compter: vi.fn(),
    effacerComptage: vi.fn(),
    valider: vi.fn(),
    annuler: vi.fn(),
  },
}));

let currentRole = 'manager';
vi.mock('../lib/AuthContext', () => ({
  useOptionalAuth: () => ({ user: { id: 1, role: currentRole }, hasRole: (...r: string[]) => r.includes(currentRole) }),
  useAuth: () => ({ user: { id: 1, role: currentRole }, hasRole: (...r: string[]) => r.includes(currentRole) }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { inventaireService } from '../services/api';
import { toast } from 'sonner';

const mocked = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const entete = {
  id: 7,
  numero: 'INV-2026-00007',
  location_id: 2,
  location_nom: 'Hitek Plateau',
  location_type: 'magasin',
  statut: 'en_cours',
  categorie: null,
  comptage_aveugle: true,
  notes: null,
  created_at: '2026-11-10T08:00:00.000Z',
  date_validation: null,
  cree_par_nom: 'Awa Koné',
  valide_par_nom: null,
  nb_lignes: 2,
  nb_comptees: 1,
  nb_ecarts: 1,
  unites_en_plus: 0,
  unites_en_moins: 3,
  valeur_ecart: -3000,
  voit_ecarts: true,
  voit_valeurs: true,
};

const souris = {
  id: 11, produit_id: 101, produit_nom: 'Souris USB', reference: 'INF-SOU-001', code_barre: '2000000000015',
  quantite_theorique: 10, quantite_comptee: 7, ecart: -3, cmp: 1000, valeur_ecart: -3000, compte_le: '2026-11-10T09:00:00.000Z',
};
const clavier = {
  id: 12, produit_id: 102, produit_nom: 'Clavier AZERTY', reference: 'INF-CLA-002', code_barre: null,
  quantite_theorique: 4, quantite_comptee: null, ecart: null, cmp: 5000, valeur_ecart: null, compte_le: null,
};

const page = (rows: unknown[]) => ({ data: rows, pagination: { page: 1, limit: 50, total: rows.length, totalPages: 1 } });

/** Sans CSS, jsdom rend le tableau ET les cartes mobiles : on lit le tableau. */
const feuille = () => screen.getByRole('table', { name: /Feuille de comptage/ });

function renderPage(role = 'manager', url = '/inventaire-physique/7') {
  currentRole = role;
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ConfirmProvider>
        <Routes>
          <Route path="/inventaire-physique/:id" element={<InventairePhysiqueDetail />} />
        </Routes>
      </ConfirmProvider>
    </MemoryRouter>
  );
}

describe('InventairePhysiqueDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked(inventaireService.getById).mockResolvedValue(entete);
    mocked(inventaireService.getLignes).mockResolvedValue(page([clavier, souris]));
  });

  it('montre au gérant la synthèse, le stock attendu et les écarts', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'INV-2026-00007' })).toBeInTheDocument();
    expect(screen.getByText(/Hitek Plateau · ouvert le .+ par Awa Koné/)).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('1 à compter')).toBeInTheDocument();

    const table = await screen.findByRole('table', { name: /Feuille de comptage/ });
    expect(within(table).getByRole('columnheader', { name: 'Stock attendu' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Valeur de l’écart' })).toBeInTheDocument();
    const ligneSouris = within(table).getByText('Souris USB').closest('tr')!;
    expect(within(ligneSouris).getByText('−3')).toBeInTheDocument();
    expect(within(ligneSouris).getByLabelText('Quantité comptée de Souris USB')).toHaveValue('7');

    expect(screen.getByRole('button', { name: 'Écarts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider l’inventaire' })).toBeInTheDocument();
  });

  it('enregistre la quantité saisie dans la feuille quand on quitte le champ', async () => {
    const user = userEvent.setup();
    mocked(inventaireService.compter).mockResolvedValue({ ...clavier, quantite_comptee: 4, ecart: 0, valeur_ecart: 0 });
    renderPage();

    const champ = within(await screen.findByRole('table', { name: /Feuille/ })).getByLabelText(
      'Quantité comptée de Clavier AZERTY'
    );
    await user.click(champ);
    await user.keyboard('4');
    await user.tab();

    await waitFor(() =>
      expect(inventaireService.compter).toHaveBeenCalledWith(7, { produit_id: 102, quantite: 4, mode: 'fixer' })
    );
    // La synthèse est relue sans repasser par l'état de chargement.
    await waitFor(() => expect(inventaireService.getById).toHaveBeenCalledTimes(2));
    expect(feuille()).toBeInTheDocument();
  });

  it('refuse une quantité qui n’est pas un entier et efface un comptage vidé', async () => {
    const user = userEvent.setup();
    mocked(inventaireService.effacerComptage).mockResolvedValue(undefined);
    renderPage();

    const champ = within(await screen.findByRole('table', { name: /Feuille/ })).getByLabelText(
      'Quantité comptée de Souris USB'
    );
    await user.clear(champ);
    await user.type(champ, '2,5');
    await user.tab();
    expect(toast.error).toHaveBeenCalledWith('Saisissez une quantité entière, sans signe ni virgule.');
    expect(inventaireService.compter).not.toHaveBeenCalled();
    expect(champ).toHaveValue('7');

    await user.clear(champ);
    await user.tab();
    await waitFor(() => expect(inventaireService.effacerComptage).toHaveBeenCalledWith(7, 11));
  });

  it('ajoute une unité à chaque scan et dit ce qui a été compté', async () => {
    const user = userEvent.setup();
    mocked(inventaireService.compter).mockResolvedValue({ ...souris, quantite_comptee: 8, ajoutee_a_la_feuille: false });
    renderPage();

    const scan = await screen.findByLabelText('Scanner un article');
    await user.type(scan, '2000000000015{Enter}');

    await waitFor(() =>
      expect(inventaireService.compter).toHaveBeenCalledWith(7, { code: '2000000000015', quantite: 1, mode: 'ajouter' })
    );
    expect(await screen.findByText('Souris USB : 8 comptés')).toHaveAttribute('role', 'status');
    expect(scan).toHaveValue('');
  });

  it('affiche l’erreur du serveur quand le code scanné est inconnu', async () => {
    const user = userEvent.setup();
    mocked(inventaireService.compter).mockRejectedValue({
      response: { status: 422, data: { success: false, error: 'Aucun produit ne porte le code « 999 ».' } },
    });
    renderPage();

    await user.type(await screen.findByLabelText('Scanner un article'), '999{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Aucun produit ne porte le code « 999 ».');
  });

  it('comptage à l’aveugle : le compteur ne voit ni stock attendu, ni écarts, ni validation', async () => {
    mocked(inventaireService.getById).mockResolvedValue({
      ...entete,
      nb_ecarts: undefined,
      unites_en_plus: undefined,
      unites_en_moins: undefined,
      valeur_ecart: undefined,
      voit_ecarts: false,
      voit_valeurs: false,
    });
    mocked(inventaireService.getLignes).mockResolvedValue(
      page([
        { id: 12, produit_id: 102, produit_nom: 'Clavier AZERTY', reference: 'INF-CLA-002', code_barre: null, quantite_comptee: null, compte_le: null },
      ])
    );
    renderPage('depot_staff');

    const table = await screen.findByRole('table', { name: /Feuille de comptage/ });
    expect(within(table).queryByRole('columnheader', { name: 'Stock attendu' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: 'Écart' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Écarts' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Valider l’inventaire' })).not.toBeInTheDocument();
    expect(screen.queryByText('Valeur de l’écart')).not.toBeInTheDocument();
    expect(screen.getByText(/comptage à l’aveugle : le stock attendu est masqué/)).toBeInTheDocument();
    expect(within(table).getByLabelText('Quantité comptée de Clavier AZERTY')).toBeEnabled();
  });

  it('valide en demandant quoi faire des produits non comptés', async () => {
    const user = userEvent.setup();
    mocked(inventaireService.valider).mockResolvedValue({
      id: 7, numero: 'INV-2026-00007', lignes_ajustees: 2, unites_en_plus: 0, unites_en_moins: 7, valeur_ecart: -23000,
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Valider l’inventaire' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/1 produit compté sur 2/)).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'Garder leur stock' })).toBeChecked();

    await user.click(within(dialog).getByRole('radio', { name: 'Les sortir du stock' }));
    expect(within(dialog).getByText(/tenu pour absent/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Valider et ajuster le stock' }));

    await waitFor(() => expect(inventaireService.valider).toHaveBeenCalledWith(7, 'zero'));
    expect(toast.success).toHaveBeenCalledWith('Inventaire INV-2026-00007 validé : 2 produits ajustés');
  });

  it('un inventaire validé se lit sans champ de saisie ni scan', async () => {
    mocked(inventaireService.getById).mockResolvedValue({
      ...entete,
      statut: 'valide',
      date_validation: '2026-11-10T17:00:00.000Z',
      valide_par_nom: 'Awa Koné',
    });
    renderPage();

    const table = await screen.findByRole('table', { name: /Feuille de comptage/ });
    expect(screen.queryByLabelText('Scanner un article')).not.toBeInTheDocument();
    expect(within(table).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(table).getByText('Non compté')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Valider l’inventaire' })).not.toBeInTheDocument();
    expect(screen.getByText(/validé le .+ par Awa Koné/)).toBeInTheDocument();
  });

  it('une feuille qui ne charge pas ne ressemble pas à une feuille vide', async () => {
    mocked(inventaireService.getLignes).mockRejectedValue(new Error('Network Error'));
    renderPage();

    expect(await screen.findByText('Impossible de charger la feuille de comptage')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.queryByText('La feuille est vide')).not.toBeInTheDocument();
  });
});
