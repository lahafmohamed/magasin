import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import Dashboard from '../pages/Dashboard';
import { canAccessPath } from '@/config/routeAccess';
import { formatDayMonth } from '../utils/format';

// Services du tableau de bord : chaque hub de rôle n'appelle que les siens.
vi.mock('../services/api', () => ({
  factureService: {
    getRevenueTrends: vi.fn(),
    getTopProducts: vi.fn(),
    getTopClients: vi.fn(),
    getAll: vi.fn(),
  },
  produitService: {
    getStockByCategory: vi.fn(),
    getAll: vi.fn(),
  },
  commandeService: { getStats: vi.fn() },
  paiementService: { getStats: vi.fn() },
  reportService: {
    getAlerts: vi.fn(),
    getRevenueForecast: vi.fn(),
    getYoYComparison: vi.fn(),
    getReceivables: vi.fn(),
  },
  caisseService: {
    getMagasins: vi.fn(),
    getSessionActive: vi.fn(),
    getHistorique: vi.fn(),
    getAudit: vi.fn(),
  },
  devisService: { getAll: vi.fn() },
  bonLivraisonService: { getAll: vi.fn() },
  demandeService: { getAll: vi.fn() },
  receptionService: { getPending: vi.fn() },
  retourService: { getStats: vi.fn() },
  stockLocationService: { getAll: vi.fn() },
  stockTransferService: { getAll: vi.fn() },
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, className }: { children?: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useNavigate: () => () => {},
}));

vi.mock('recharts', () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Nothing = () => null;
  return {
    AreaChart: Box,
    BarChart: Box,
    PieChart: Box,
    ResponsiveContainer: Box,
    Area: Nothing,
    Bar: Nothing,
    Pie: Nothing,
    Cell: Nothing,
    XAxis: Nothing,
    YAxis: Nothing,
    CartesianGrid: Nothing,
    Tooltip: Nothing,
  };
});

// Widget des demandes (lot P2) : on vérifie seulement qui le voit.
vi.mock('../components/DashboardDemandeWidgets', () => ({
  DashboardDemandeWidgets: () => <div data-testid="demande-widgets" />,
}));

const auth = vi.hoisted(() => ({ role: 'admin' }));
vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 42, username: 'tester', role: auth.role },
    hasRole: (...roles: string[]) => roles.includes(auth.role),
  }),
}));
vi.mock('../lib/ModulesContext', () => ({
  useModules: () => ({ estCheminActif: () => true }),
}));

import {
  bonLivraisonService,
  caisseService,
  commandeService,
  demandeService,
  devisService,
  factureService,
  paiementService,
  produitService,
  receptionService,
  reportService,
  retourService,
  stockLocationService,
  stockTransferService,
} from '../services/api';

const page = <T,>(data: T[], total = data.length) => ({
  data,
  pagination: { page: 1, limit: 5, total, totalPages: 1 },
});

const now = new Date();
const atToday = (h: number, m = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).toISOString();
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) => dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));

const SHOP = { id: 1, nom: 'Hitek Plateau', location_id: 1 };
const LOCATIONS = [
  { id: 1, nom: 'Hitek Plateau', actif: true, location_type: 'magasin', responsable_id: null },
  { id: 2, nom: 'Dépôt Vridi', actif: true, location_type: 'depot', responsable_id: null },
];
const OPEN_SESSION = {
  id: 3,
  date_ouverture: atToday(8, 5),
  fond_initial: 50000,
  expected_cash: 666000,
  especes_encaissees: 680900,
  especes_decaissees: 64900,
  par_methode: [
    { methode_paiement: 'espece', total_encaissements: 680900, total_decaissements: 64900, nb: 9 },
    { methode_paiement: 'wave', total_encaissements: 150000, total_decaissements: 0, nb: 1 },
  ],
  session_age_hours: 2,
  requires_manager_action: false,
  ouvert_par_username: 'tester',
};
const LOW_STOCK = [
  { id: 12, nom: 'Samsung 32″ UHD 4K', reference: 'INF-MON-003', stock: 0, stock_min: 2, prix_vente: '295000.00' },
  { id: 9, nom: 'Lenovo ThinkCentre M70q', reference: 'INF-DSK-003', stock: 1, stock_min: 2, prix_vente: '399000.00' },
  { id: 40, nom: 'Chargeur rapide 25 W USB-C', reference: 'INF-TEL-003', stock: 4, stock_min: 10, prix_vente: '12000.00' },
];

function primeHappyPath() {
  vi.mocked(factureService.getRevenueTrends).mockResolvedValue([]);
  vi.mocked(factureService.getTopProducts).mockResolvedValue([]);
  vi.mocked(factureService.getTopClients).mockResolvedValue([]);
  vi.mocked(factureService.getAll).mockResolvedValue(page([]));
  vi.mocked(produitService.getStockByCategory).mockResolvedValue([]);
  vi.mocked(produitService.getAll).mockResolvedValue(page([]));
  vi.mocked(commandeService.getStats).mockResolvedValue({ en_attente: '1', validee: '1', expediee: '0', livree: '4' });
  vi.mocked(paiementService.getStats).mockResolvedValue({ par_methode: [], aujourdhui: { nombre: '0', total: '0' } });
  vi.mocked(reportService.getAlerts).mockResolvedValue({ low_stock: [], overdue_invoices: [], pending_orders: [] });
  vi.mocked(reportService.getRevenueForecast).mockResolvedValue(null);
  vi.mocked(reportService.getYoYComparison).mockResolvedValue(null);
  vi.mocked(reportService.getReceivables).mockResolvedValue({ ...page([]), summary: { montant_total: 0 } });
  vi.mocked(caisseService.getMagasins).mockResolvedValue([SHOP]);
  vi.mocked(caisseService.getSessionActive).mockResolvedValue(null);
  vi.mocked(caisseService.getHistorique).mockResolvedValue(page([]));
  vi.mocked(caisseService.getAudit).mockResolvedValue({ data: [], summary: [], orphans_total: 0 });
  vi.mocked(devisService.getAll).mockResolvedValue(page([]));
  vi.mocked(bonLivraisonService.getAll).mockResolvedValue(page([]));
  vi.mocked(demandeService.getAll).mockResolvedValue(page([]));
  vi.mocked(receptionService.getPending).mockResolvedValue([]);
  vi.mocked(retourService.getStats).mockResolvedValue({ en_attente: '0' });
  vi.mocked(stockLocationService.getAll).mockResolvedValue(LOCATIONS);
  vi.mocked(stockTransferService.getAll).mockResolvedValue(page([]));
}

/**
 * Le hub gérant monte une vingtaine de cartes : sous jsdom, quand toute la
 * suite tourne en parallèle, son premier rendu dépasse les 5 s par défaut.
 */
const SLOW_RENDER_MS = 15000;
vi.setConfig({ testTimeout: 30000 });

/** Toutes les données chargées : plus aucune tuile en attente. */
async function settled() {
  await screen.findByText(/Mis à jour à/, {}, { timeout: SLOW_RENDER_MS });
}

/** Valeur d'une tuile : le paragraphe qui suit son libellé. */
function tileValue(label: string): string {
  const labelEl = screen.getByText(label, { selector: 'p' });
  return labelEl.nextElementSibling?.textContent ?? '';
}

/** Indication d'une tuile : le paragraphe sous sa valeur ; `undefined` s'il n'y en a pas. */
function tileHint(label: string): string | undefined {
  const hint = screen.getByText(label, { selector: 'p' }).nextElementSibling?.nextElementSibling;
  return hint?.tagName === 'P' ? hint.textContent ?? '' : undefined;
}

/** Montant d'une ligne de l'équation du tiroir (« Ma caisse »). */
function tillAmount(label: string): string {
  return screen.getByText(label, { selector: 'dt' }).parentElement?.querySelector('dd')?.textContent ?? '';
}

/** Titre de carte, compte compris (« Devis à confirmer 4 ») : son nom accessible. */
function cardHeading(name: string | RegExp) {
  return screen.getByRole('heading', { level: 2, name });
}

/** Carte qui porte ce titre. */
function cardOf(name: RegExp): HTMLElement {
  const card = cardHeading(name).closest<HTMLElement>('.rounded-lg');
  if (!card) throw new Error(`Pas de carte pour ${name}`);
  return card;
}

/** Lien « Tout voir » d'une carte (le contexte est pour les lecteurs d'écran). */
function seeAll(context: string) {
  return screen.getByRole('link', { name: new RegExp(`^Tout voir\\s*: ${context}$`) });
}

describe('Dashboard — hub gérant / administrateur', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.role = 'manager';
    primeHappyPath();
  });

  it('renders one page title and the today, activity and demandes sections', async () => {
    render(<Dashboard />);
    await settled();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Aujourd’hui' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Activité commerciale' })).toBeInTheDocument();
    expect(screen.getByTestId('demande-widgets')).toBeInTheDocument();
  });

  it('gathers what needs action from every source in the « À traiter » banner', async () => {
    vi.mocked(reportService.getAlerts).mockResolvedValue({
      low_stock: [],
      overdue_invoices: [{ id: 1 }, { id: 2 }],
      pending_orders: [{ id: 3 }],
    });
    vi.mocked(demandeService.getAll).mockResolvedValue(page([], 3));
    vi.mocked(retourService.getStats).mockResolvedValue({ en_attente: '1' });
    vi.mocked(caisseService.getSessionActive).mockResolvedValue({
      ...OPEN_SESSION,
      session_age_hours: 30,
      requires_manager_action: true,
    });
    vi.mocked(caisseService.getHistorique).mockResolvedValue(
      page([
        { id: 1, date_cloture: atToday(12), ecart: -440 },
        { id: 2, date_cloture: atToday(13), ecart: 0 },
      ])
    );
    vi.mocked(caisseService.getAudit).mockResolvedValue({ data: [], summary: [], orphans_total: 2 });

    render(<Dashboard />);
    await settled();

    const chip = (text: string) => screen.getByText(text).closest('a')?.getAttribute('href');
    expect(chip('2 factures échues depuis plus de 30 jours')).toBe('/relances');
    expect(chip('3 demandes à décider')).toBe('/demandes?statut=envoyee');
    // Chaque vérification ouvre la liste déjà filtrée sur ce qu'elle compte.
    expect(chip('1 retour à approuver')).toBe('/retours?statut=en_attente');
    expect(chip('1 caisse ouverte depuis plus de 24 h')).toBe('/caisse');
    expect(chip('1 clôture de caisse avec écart aujourd’hui')).toMatch(/^\/caisse\/historique\?from=\d{4}-\d{2}-\d{2}$/);
    expect(chip('1 commande fournisseur en retard')).toBe('/commandes');
    expect(chip('2 paiements en espèces hors caisse')).toBe('/caisse/audit?orphans_only=true');
    expect(caisseService.getAudit).toHaveBeenCalledWith({ orphans_only: true, limit: 1 });
  });

  it('says nothing is pending only when every check answered', async () => {
    render(<Dashboard />);
    await settled();
    expect(screen.getByText(/Rien à traiter pour le moment/)).toBeInTheDocument();
  });

  it('never claims « Rien à traiter » when a check failed', async () => {
    vi.mocked(reportService.getAlerts).mockRejectedValue(new Error('boom'));
    render(<Dashboard />);
    await settled();
    expect(screen.queryByText(/Rien à traiter/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Vérification impossible : factures échues et commandes en retard/)
    ).toBeInTheDocument();
  });

  it('keeps a failed request inside its own card: « Indisponible », never 0', async () => {
    vi.mocked(paiementService.getStats).mockRejectedValue(new Error('boom'));
    vi.mocked(factureService.getRevenueTrends).mockResolvedValue([
      { date: daysAgo(0), total: '1114500', count: '3' },
    ]);
    render(<Dashboard />);
    await settled();
    expect(tileValue('Encaissé aujourd’hui')).toBe('Indisponible');
    expect(screen.getAllByText('Indisponible')).toHaveLength(1);
    expect(tileValue('Chiffre d’affaires du jour')).toMatch(/^1\s114\s500\sFCFA$/);
    expect(screen.getByText('Impossible de charger les encaissements')).toBeInTheDocument();
  });

  it('shows the same low-stock count in the tile and in the list card (U-10)', async () => {
    vi.mocked(produitService.getAll).mockResolvedValue(page(LOW_STOCK, 3));
    render(<Dashboard />);
    await settled();
    expect(tileValue('Produits en stock bas')).toBe('3');
    expect(screen.getByText('3 produits sous leur stock minimum, tous emplacements confondus')).toBeInTheDocument();
  });

  it('inks the best day in the revenue chart and names it as the « Factures émises » tile does', async () => {
    vi.mocked(factureService.getRevenueTrends).mockResolvedValue([
      { date: daysAgo(2), total: '500000', count: '2' },
      { date: daysAgo(0), total: '100000', count: '1' },
    ]);
    render(<Dashboard />);
    await settled();
    const bestDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
    const best = formatDayMonth(bestDate);
    expect(tileHint('Factures émises')).toMatch(new RegExp(`^Meilleur jour : ${best.replace('.', '\\.')} · 500\\s000\\sFCFA$`));
    expect(
      screen.getByText(`30 derniers jours. En bleu : le ${best}, meilleur jour. Un jour sans facture n’a pas de barre.`)
    ).toBeInTheDocument();
    // La couleur n'est jamais le seul repère : le jour de semaine encré est nommé aussi.
    const weekday = bestDate.toLocaleDateString('fr-FR', { weekday: 'long' });
    expect(
      screen.getByText(`Sur les 30 derniers jours, jours sans vente compris. En bleu : le ${weekday}, meilleur jour en moyenne.`)
    ).toBeInTheDocument();
  });

  it('shows the payment mix as one bar and a list ranked by amount, with each share', async () => {
    vi.mocked(paiementService.getStats).mockResolvedValue({
      par_methode: [
        { methode_paiement: 'espece', nombre: '4', total: '100000' },
        { methode_paiement: 'wave', nombre: '19', total: '300000' },
      ],
      aujourdhui: { nombre: '0', total: '0' },
    });
    render(<Dashboard />);
    await settled();
    expect(
      screen.getByRole('img', { name: /^Répartition des encaissements : Wave 75\s%, Espèces 25\s%$/ })
    ).toBeInTheDocument();
    const [first, second] = [...(screen.getByText('Wave').closest('ol')?.querySelectorAll('li') ?? [])];
    expect(within(first).getByText('Wave')).toBeInTheDocument();
    expect(within(first).getByText(/^300\s000\sFCFA$/)).toBeInTheDocument();
    expect(within(first).getByText('19 paiements')).toBeInTheDocument();
    expect(within(first).getByText(/^75\s%$/)).toBeInTheDocument();
    expect(within(second).getByText('Espèces')).toBeInTheDocument();
    expect(within(second).getByText(/^25\s%$/)).toBeInTheDocument();
  });

  it('cuts the revenue windows by calendar day, today included', async () => {
    vi.mocked(factureService.getRevenueTrends).mockResolvedValue([
      { date: daysAgo(0), total: '100000', count: '2' },
      { date: daysAgo(40), total: '50000', count: '1' },
    ]);
    render(<Dashboard />);
    await settled();
    expect(factureService.getRevenueTrends).toHaveBeenCalledWith(60);
    expect(tileValue('Chiffre d’affaires sur 30 jours')).toMatch(/^100\s000\sFCFA$/);
    expect(tileValue('Factures émises')).toBe('2');
    expect(screen.getByText('+100 %')).toBeInTheDocument();
  });

  it('reads invoice amounts from `total`', async () => {
    vi.mocked(factureService.getAll).mockResolvedValue(
      page([
        {
          id: 1,
          numero_facture: 'FAC-2026-0001',
          statut: 'payee',
          total: '1850000',
          client_nom: 'Cabinet Kouadio',
          date_facture: '2026-10-05T08:15:00.000Z',
        },
      ])
    );
    render(<Dashboard />);
    await settled();
    expect(screen.getByText('FAC-2026-0001')).toBeInTheDocument();
    expect(screen.getByText(/^1\s850\s000\sFCFA$/)).toBeInTheDocument();
  });

  it('labels payment methods from `methode_paiement` / `nombre`', async () => {
    vi.mocked(paiementService.getStats).mockResolvedValue({
      par_methode: [{ methode_paiement: 'espece', nombre: '412', total: '186450000' }],
      aujourdhui: { nombre: '0', total: '0' },
    });
    render(<Dashboard />);
    await settled();
    expect(screen.getByText('Espèces')).toBeInTheDocument();
    expect(screen.getByText('412 paiements')).toBeInTheDocument();
  });
});

describe('Dashboard — hub caissier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.role = 'caissier';
    primeHappyPath();
  });

  it('shows « Ma caisse » with the cash the drawer should hold, and no business analytics', async () => {
    vi.mocked(caisseService.getSessionActive).mockResolvedValue(OPEN_SESSION);
    vi.mocked(factureService.getAll).mockResolvedValue(
      page([
        { id: 116, numero_facture: 'FAC-2026-00116', statut: 'en_attente', total: '398000', remaining_due: '398000', date_facture: atToday(10), location_id: 1, client_nom: 'BAMBA' },
        { id: 115, numero_facture: 'FAC-2026-00115', statut: 'payee', total: '47500', remaining_due: '0', date_facture: atToday(9), location_id: 1, client_nom: 'N’GUESSAN' },
      ])
    );
    render(<Dashboard />);
    await settled();

    expect(screen.getByRole('heading', { name: 'Ma caisse' })).toBeInTheDocument();
    expect(tillAmount('Espèces attendues en caisse')).toMatch(/^666\s000\sFCFA$/);
    // La pastille dit « Ouverte » : la ligne qui la suit ne le répète pas.
    expect(screen.getByText('depuis 08:05')).toBeInTheDocument();
    expect(screen.getAllByText(/Ouverte/)).toHaveLength(1);
    expect(screen.getByText('FAC-2026-00116')).toBeInTheDocument();
    expect(screen.queryByText('FAC-2026-00115')).not.toBeInTheDocument();
    expect(tileValue('Ventes du jour')).toMatch(/^445\s500\sFCFA$/);

    // Ni chiffre d'affaires de l'entreprise, ni meilleurs clients.
    expect(screen.queryByText('Activité commerciale')).not.toBeInTheDocument();
    expect(screen.queryByText(/meilleurs clients/)).not.toBeInTheDocument();
    expect(reportService.getAlerts).not.toHaveBeenCalled();
    expect(factureService.getTopClients).not.toHaveBeenCalled();
    expect(factureService.getRevenueTrends).not.toHaveBeenCalled();
    expect(screen.queryByTestId('demande-widgets')).not.toBeInTheDocument();

    expect(screen.getByText('Nouvelle facture').closest('a')).toHaveAttribute('href', '/factures/nouvelle');
  });

  it('offers « Ouvrir la caisse » first when the till is closed', async () => {
    render(<Dashboard />);
    await settled();
    expect(screen.getByText('La caisse est fermée. Ouvrez-la pour encaisser des espèces.')).toBeInTheDocument();
    expect(screen.getByText('Ouvrir la caisse').closest('a')).toHaveAttribute('href', '/caisse');
    // Aucune facture : « Ventes du jour » le dit, « Reste à encaisser » ne le répète pas.
    expect(tileHint('Ventes du jour')).toBe('Aucune facture pour le moment');
    expect(tileHint('Reste à encaisser')).toBeUndefined();
    // Le menu latéral est visible dès `lg` : les accès rapides ne le recopient que plus étroit.
    expect(screen.getByRole('heading', { name: 'Accès rapides' }).closest('section')).toHaveClass('lg:hidden');
  });

  it('shows the drawer as one equation, each amount on its own label / amount row (GV-02)', async () => {
    vi.mocked(caisseService.getSessionActive).mockResolvedValue({
      ...OPEN_SESSION,
      fond_initial: 1250000,
      especes_encaissees: 1680900,
      especes_decaissees: 64900,
      expected_cash: 2866000,
    });
    render(<Dashboard />);
    await settled();

    // fonds + espèces encaissées − sorties = espèces attendues, dans cet ordre.
    const terms = screen.getByText('Fonds de caisse', { selector: 'dt' }).closest('dl')?.querySelectorAll('dt') ?? [];
    expect([...terms].map((t) => t.textContent)).toEqual([
      'Fonds de caisse',
      'Espèces encaissées',
      'Sorties d’espèces',
      'Espèces attendues en caisse',
    ]);
    for (const [label, amount] of [
      ['Fonds de caisse', /^1\s250\s000\sFCFA$/],
      ['Espèces encaissées', /^\+1\s680\s900\sFCFA$/],
      ['Sorties d’espèces', /^−64\s900\sFCFA$/],
      ['Espèces attendues en caisse', /^2\s866\s000\sFCFA$/],
    ] as const) {
      const term = screen.getByText(label, { selector: 'dt' });
      const row = term.parentElement;
      expect(row?.children).toHaveLength(2);
      expect(row?.querySelector('dd')?.textContent).toMatch(amount);
      expect(row?.className).not.toMatch(/grid-cols-3/);
    }
  });

  it('asks to close yesterday’s till first, with a link that opens its closing (P-M2)', async () => {
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 0).toISOString();
    vi.mocked(caisseService.getSessionActive).mockResolvedValue({
      ...OPEN_SESSION,
      date_ouverture: yesterday,
      session_age_hours: 3,
    });
    render(<Dashboard />);
    await settled();

    expect(screen.getByText(/Caisse ouverte hier \(.+ à 23:00\) et non clôturée/)).toBeInTheDocument();
    expect(
      screen.getByText(/À partir de 23:00, les encaissements seront bloqués jusqu’au passage d’un gérant\./)
    ).toBeInTheDocument();
    expect(screen.getByText('Clôturer la caisse d’hier').closest('a')).toHaveAttribute(
      'href',
      '/caisse?magasin=1&cloture=1'
    );
    // L'action du jour attend que la caisse de la veille soit clôturée.
    expect(screen.queryByText('Nouvelle facture')).not.toBeInTheDocument();
  });

  it('never shows a failed till check as a closed till', async () => {
    vi.mocked(caisseService.getMagasins).mockRejectedValue(new Error('boom'));
    render(<Dashboard />);
    await screen.findByText('Impossible de vérifier l’état de la caisse', {}, { timeout: SLOW_RENDER_MS });
    expect(screen.queryByText(/La caisse est fermée/)).not.toBeInTheDocument();
    expect(screen.queryByText('Ouvrir la caisse')).not.toBeInTheDocument();
  });
});

describe('Dashboard — hub dépôt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.role = 'depot_staff';
    primeHappyPath();
    vi.mocked(receptionService.getPending).mockResolvedValue([
      { id: 6, numero_commande: 'CMD-2026-00006', fournisseur_nom: 'HP Côte d’Ivoire SA', date_livraison_prevue: daysAgo(-3), sous_total: '1034090.00' },
    ]);
    vi.mocked(demandeService.getAll).mockImplementation(async (filters) => {
      if (filters?.statut === 'envoyee') {
        return page([{ id: 2, numero: 'DEM-2026-00002', statut: 'envoyee', magasin_nom: 'Hitek Plateau', depot_id: 2, date_envoi: atToday(9) }]);
      }
      if (filters?.statut === 'approuvee') {
        return page([{ id: 3, numero: 'DEM-2026-00003', statut: 'approuvee', magasin_nom: 'Hitek Plateau', depot_id: 2, date_decision: atToday(9) }]);
      }
      return page([]);
    });
    vi.mocked(stockTransferService.getAll).mockImplementation(async (_search, statut) =>
      statut === 'en_preparation'
        ? page([{ id: 4, numero_transfer: 'TRF-2026-00004', statut: 'en_preparation', source_nom: 'Dépôt Vridi', destination_nom: 'Hitek Plateau', date_transfer: atToday(9) }])
        : page([])
    );
    vi.mocked(produitService.getAll).mockResolvedValue(page(LOW_STOCK, 9));
  });

  it('shows receptions, demandes, transfers and depot stock — and no money figure at all', async () => {
    render(<Dashboard />);
    await settled();

    expect(screen.getByText('CMD-2026-00006')).toBeInTheDocument();
    expect(screen.getByText('DEM-2026-00002')).toBeInTheDocument();
    expect(screen.getByText('TRF-2026-00004')).toBeInTheDocument();
    // Chaque compte est dans l'en-tête de sa carte ; plus de rangée de tuiles qui les répétait.
    expect(cardHeading('Commandes à réceptionner 1')).toBeInTheDocument();
    expect(cardHeading('Demandes à traiter 1 à décider · 1 à exécuter')).toBeInTheDocument();
    expect(cardHeading('Transferts en cours 1')).toBeInTheDocument();
    expect(cardHeading('Stock bas au dépôt 9')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'À faire' })).not.toBeInTheDocument();
    // L'indication de l'ancienne tuile passe au sous-titre de la carte.
    expect(screen.getByText('Validées ou expédiées, les plus anciennes d’abord')).toBeInTheDocument();
    // Le lien filtré de l'ancienne tuile devient le « Tout voir » de la carte : SON dépôt.
    expect(seeAll('produits en stock bas au dépôt')).toHaveAttribute('href', '/inventaire?low_stock=true&location_id=2');
    // Carte « Stock bas » : la quantité porte l'alerte, seule la rupture garde sa pastille.
    expect(screen.queryByText('Bas')).not.toBeInTheDocument();
    expect(screen.getAllByText('Rupture')).toHaveLength(1);
    expect(document.body.textContent).toMatch(/1 · min\.\s2/);
    // Trajet d'un transfert lu « … vers … », comme sur la page Transferts.
    expect(screen.getByText('TRF-2026-00004').closest('a')).toHaveTextContent(/Dépôt Vridi\s*vers\s*Hitek Plateau/);
    // Stock bas lu sur SON dépôt (le seul dépôt actif).
    expect(produitService.getAll).toHaveBeenCalledWith(undefined, undefined, true, 1, 5, 'stock', 'asc', 2);

    expect(document.body.textContent).not.toMatch(/FCFA/);
    expect(factureService.getRevenueTrends).not.toHaveBeenCalled();
    expect(factureService.getTopClients).not.toHaveBeenCalled();
    expect(paiementService.getStats).not.toHaveBeenCalled();
    expect(reportService.getAlerts).not.toHaveBeenCalled();
    expect(caisseService.getMagasins).not.toHaveBeenCalled();

    expect(screen.getByText(/Réceptionner CMD-2026-00006/).closest('a')).toHaveAttribute(
      'href',
      '/receptions?commande_id=6'
    );
  });

  it('stacks the cards in two independent columns: réceptions + demandes | transferts + stock', async () => {
    render(<Dashboard />);
    await settled();
    const receptions = cardOf(/^Commandes à réceptionner/);
    const transferts = cardOf(/^Transferts en cours/);
    const demandes = cardOf(/^Demandes à traiter/);
    const stock = cardOf(/^Stock bas au dépôt/);
    // Une pile par colonne : une carte courte ne laisse plus de trou sous elle.
    expect(receptions.parentElement).toBe(demandes.parentElement);
    expect(transferts.parentElement).toBe(stock.parentElement);
    expect(receptions.parentElement).not.toBe(transferts.parentElement);
    expect(receptions.parentElement?.parentElement).toHaveClass('lg:grid-cols-2');
    // Sur téléphone, l'ordre du travail : réceptions, demandes, transferts, stock.
    const order = [receptions, demandes, transferts, stock];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('never prints a count over a card whose request failed', async () => {
    vi.mocked(stockTransferService.getAll).mockRejectedValue(new Error('boom'));
    render(<Dashboard />);
    await settled();
    expect(cardHeading('Transferts en cours')).toBeInTheDocument();
    expect(screen.getByText('Impossible de charger les transferts')).toBeInTheDocument();
    // Les autres cartes gardent leur compte.
    expect(cardHeading('Commandes à réceptionner 1')).toBeInTheDocument();
  });
});

describe('Dashboard — hub magasin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.role = 'magasin_staff';
    primeHappyPath();
  });

  it('lists devis and delivery notes to move forward, and low stock in his own shop', async () => {
    vi.mocked(devisService.getAll).mockImplementation(async (_search, statut) =>
      statut === 'brouillon'
        ? page([{ id: 1, numero_devis: 'DEV-2026-00001', statut: 'brouillon', total: '3345000', date_devis: daysAgo(20) }])
        : page([{ id: 7, numero_devis: 'DEV-2026-00007', statut: 'envoye', total: '56000', date_devis: daysAgo(5) }], 3)
    );
    vi.mocked(bonLivraisonService.getAll).mockImplementation(async (_search, statut) =>
      statut === 'valide'
        ? page([{ id: 4, numero_bl: 'BL-2026-00004', statut: 'valide', total: '230000', date_bl: daysAgo(0) }])
        : page([])
    );
    vi.mocked(demandeService.getAll).mockResolvedValue(page([], 1));
    vi.mocked(produitService.getAll).mockResolvedValue(page(LOW_STOCK, 11));

    render(<Dashboard />);
    await settled();

    // Les comptes des anciennes tuiles sont dans l'en-tête de leur carte…
    expect(cardHeading('Devis à confirmer 4')).toBeInTheDocument();
    expect(cardHeading('Bons de livraison à traiter 1 à livrer · 0 à facturer')).toBeInTheDocument();
    expect(cardHeading('Stock bas au magasin 11')).toBeInTheDocument();
    for (const gone of ['Bons de livraison à livrer', 'Bons de livraison à facturer']) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
    // … « Demandes à clôturer », qu'aucune carte ne liste, devient une ligne
    // pleine largeur menant aux demandes livrées.
    expect(screen.getByRole('heading', { name: 'À faire' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^1 demande à clôturer/ })).toHaveAttribute('href', '/demandes?statut=livree');
    // Le lien filtré de l'ancienne tuile stock devient le « Tout voir » de la carte : SON magasin.
    expect(seeAll('produits en stock bas au magasin')).toHaveAttribute('href', '/inventaire?low_stock=true&location_id=1');
    // « Demander au dépôt » reste dans l'en-tête, sous le sous-titre : la droite est à « Tout voir ».
    const askDepot = screen.getByRole('link', { name: 'Demander au dépôt' });
    expect(askDepot).toHaveAttribute('href', '/demandes/nouvelle');
    expect(cardOf(/^Stock bas au magasin/).querySelector('.card-header')).toContainElement(askDepot);
    expect(screen.getByText('DEV-2026-00007').closest('a')).toHaveAttribute('href', '/devis/7');
    expect(screen.getByText('BL-2026-00004').closest('a')).toHaveAttribute('href', '/bons-livraison/4');
    expect(produitService.getAll).toHaveBeenCalledWith(undefined, undefined, true, 1, 5, 'stock', 'asc', 1);

    expect(factureService.getTopClients).not.toHaveBeenCalled();
    expect(factureService.getRevenueTrends).not.toHaveBeenCalled();
    expect(screen.getByText('Nouveau devis').closest('a')).toHaveAttribute('href', '/devis/nouveau');
    expect(screen.getByRole('heading', { name: 'Ma caisse' })).toBeInTheDocument();
  });

  it('stacks the cards in two independent columns: devis + livraisons | stock bas + caisse', async () => {
    render(<Dashboard />);
    await settled();
    const devis = cardOf(/^Devis à confirmer/);
    const stock = cardOf(/^Stock bas au magasin/);
    const bls = cardOf(/^Bons de livraison à traiter/);
    const caisse = cardOf(/^Ma caisse/);
    expect(devis.parentElement).toBe(bls.parentElement);
    expect(stock.parentElement).toBe(caisse.parentElement);
    expect(devis.parentElement).not.toBe(stock.parentElement);
    expect(devis.parentElement?.parentElement).toHaveClass('lg:grid-cols-2');
    // Sur téléphone, l'ordre du travail : devis, livraisons, stock, caisse.
    const order = [devis, bls, stock, caisse];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('keeps each count away from a card that is loading or failed: never a fake 0', async () => {
    vi.mocked(bonLivraisonService.getAll).mockRejectedValue(new Error('boom'));
    vi.mocked(caisseService.getMagasins).mockResolvedValue([]);
    render(<Dashboard />);
    await settled();
    expect(cardHeading('Bons de livraison à traiter')).toBeInTheDocument();
    expect(screen.getByText('Impossible de charger les bons de livraison')).toBeInTheDocument();
    // Aucun magasin affecté : ni compte, ni « Tout voir » vers un stock inconnu.
    expect(cardHeading('Stock bas au magasin')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Tout voir\s*: produits en stock bas/ })).not.toBeInTheDocument();
    expect(cardHeading('Devis à confirmer 0')).toBeInTheDocument();
  });
});

describe('Dashboard — liens', () => {
  it.each(['admin', 'manager', 'caissier', 'magasin_staff', 'depot_staff'])(
    'only links %s to pages that role can open',
    async (role) => {
      vi.clearAllMocks();
      auth.role = role;
      primeHappyPath();
      render(<Dashboard />);
      await settled();
      const hrefs = [...document.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) expect([href, canAccessPath(href, role)]).toEqual([href, true]);
      cleanup();
    }
  );

  it('waits for the data before stamping the update time', async () => {
    vi.clearAllMocks();
    auth.role = 'caissier';
    primeHappyPath();
    render(<Dashboard />);
    expect(screen.getByRole('status')).toHaveTextContent('Chargement…');
    await waitFor(() => expect(screen.getByText(/Mis à jour à/)).toBeInTheDocument(), { timeout: SLOW_RENDER_MS });
  });
});
