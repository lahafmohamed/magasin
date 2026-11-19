import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CaisseV2 from '../CaisseV2';
import { formatDateTime } from '@/utils/format';

vi.mock('@/services/api', () => ({
  caisseService: {
    getMagasins: vi.fn(),
    getSessionActive: vi.fn(),
    getMouvements: vi.fn(),
    getCloturePreview: vi.fn(),
    ouvrir: vi.fn(),
    cloturer: vi.fn(),
    mouvementDivers: vi.fn(),
  },
}));

let role = 'caissier';
vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 3, role } }),
  useOptionalAuth: () => ({ user: { id: 3, role } }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { caisseService } from '@/services/api';

/** Session du jeu de démonstration : 666 000 FCFA d'espèces, 1 446 630 FCFA tous modes confondus. */
const session = {
  id: 3,
  magasin_id: 1,
  magasin_nom: 'Hitek Plateau',
  magasin_code: 'MAG-PLT',
  date_ouverture: '2026-10-23T13:08:06.735Z',
  fond_initial: 50000,
  statut: 'ouverte',
  ouvert_par_username: 'a.yao',
  total_encaissements: 1461530,
  total_decaissements: 64900,
  solde_theorique: 1446630,
  expected_cash: 666000,
  especes_encaissees: 680900,
  especes_decaissees: 64900,
  hors_especes_encaissees: 780630,
  hors_especes_decaissees: 0,
  par_methode: [
    { methode_paiement: 'espece', total_encaissements: 680900, total_decaissements: 64900, nb: 9 },
    { methode_paiement: 'virement', total_encaissements: 630630, total_decaissements: 0, nb: 1 },
  ],
  session_age_hours: 6,
  requires_manager_action: false,
};

const mouvements = [
  {
    id: 8,
    date_mouvement: '2026-10-23T13:08:06.740Z',
    type: 'encaissement',
    categorie: 'paiement_client',
    montant: '131500.00',
    methode_paiement: 'espece',
    libelle: 'Paiement facture #96',
  },
  {
    id: 10,
    date_mouvement: '2026-10-23T13:08:06.818Z',
    type: 'encaissement',
    categorie: 'paiement_client',
    montant: '630630.00',
    methode_paiement: 'virement',
    libelle: 'Paiement facture #21',
  },
];

const renderPage = (entry = '/caisse') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <CaisseV2 />
    </MemoryRouter>
  );

/** Date locale relative à aujourd'hui (`days` = -1 : hier), à l'heure donnée. */
const localDate = (days: number, hours: number, minutes = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
};

/** Espaces insécables normalisés. */
const norm = (text: string) => text.replace(/[\u00A0\u202F]/g, ' ');
/** Texte visible d'un nœud, espaces insécables normalisés. */
const textOf = (el: Element | null) => norm(el?.textContent ?? '');

describe('CaisseV2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    role = 'caissier';
    (caisseService.getMagasins as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, code: 'MAG-PLT', nom: 'Hitek Plateau' },
    ]);
    (caisseService.getSessionActive as ReturnType<typeof vi.fn>).mockResolvedValue(session);
    (caisseService.getMouvements as ReturnType<typeof vi.fn>).mockResolvedValue(mouvements);
  });

  it('heads the till with the cash the drawer must hold (expected_cash), not the all-methods balance', async () => {
    renderPage();

    // La tuile (libellé + valeur dans la même carte), une fois la session chargée.
    await waitFor(() =>
      expect(textOf(screen.getByText('Espèces attendues en caisse').closest('.rounded-lg'))).toContain('666 000')
    );

    // Le « solde théorique » tous modes (carte, virement…) n'est jamais présenté
    // comme le contenu du tiroir.
    expect(textOf(document.body)).not.toContain('1 446 630');
    expect(screen.queryByText('Solde théorique')).not.toBeInTheDocument();

    // Hors espèces affiché à part.
    const horsEspeces = screen.getByText('Hors espèces, pas dans le tiroir').closest('.rounded-lg');
    expect(textOf(horsEspeces)).toContain('780 630');
  });

  it('shows the running cash balance only for cash movements', async () => {
    renderPage();
    await screen.findAllByText('Paiement facture #96');
    // 50 000 de fonds + 131 500 en espèces.
    expect(textOf(document.body)).toContain('181 500');
    // Le virement ne change pas les espèces : pas de « 812 130 » (181 500 + 630 630).
    expect(textOf(document.body)).not.toContain('812 130');
  });

  it('never presents a failed session load as a closed till', async () => {
    (caisseService.getSessionActive as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('réseau'));
    renderPage();

    expect(await screen.findByText('Impossible de charger la caisse de ce magasin')).toBeInTheDocument();
    expect(screen.queryByText(/Caisse fermée/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ouvrir la caisse/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Réessayer/ })).toBeInTheDocument();
  });

  it('offers to open the till only when the session request says it is closed', async () => {
    (caisseService.getSessionActive as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    renderPage();

    expect(await screen.findByText(/Caisse fermée/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Ouvrir la caisse/ }).length).toBeGreaterThan(0);
  });

  it('hides the history link from a cashier and shows it to a manager', async () => {
    renderPage();
    await screen.findByText('Espèces attendues en caisse');
    expect(screen.queryByRole('link', { name: /Historique/ })).not.toBeInTheDocument();
  });

  it('lets a manager open the till history', async () => {
    role = 'manager';
    renderPage();
    await screen.findByText('Espèces attendues en caisse');
    expect(screen.getByRole('link', { name: /Historique/ })).toHaveAttribute('href', '/caisse/historique');
  });

  it('warns about yesterday’s unclosed till and makes closing it the primary action (P-M2)', async () => {
    (caisseService.getSessionActive as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...session,
      date_ouverture: localDate(-1, 23),
      session_age_hours: 2,
    });
    renderPage();

    const title = await screen.findByText(/Caisse ouverte hier \(.+ à 23:00\) et non clôturée/);
    const banner = title.closest('div')?.parentElement ?? null;
    expect(textOf(banner)).toContain('Comptez le tiroir et clôturez-la maintenant, puis ouvrez la caisse du jour.');
    expect(textOf(banner)).toContain('À partir de 23:00, les encaissements seront bloqués jusqu’au passage d’un gérant.');

    const primary = screen.getByRole('button', { name: 'Clôturer la caisse d’hier' });
    expect(primary).toBeEnabled();
    expect(primary).toHaveAttribute('aria-describedby', 'caisse-veille');
  });

  it('shows no previous-day warning for a till opened today', async () => {
    (caisseService.getSessionActive as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...session,
      date_ouverture: localDate(0, 0, 1),
      session_age_hours: 1,
    });
    renderPage();

    expect(await screen.findByRole('button', { name: 'Clôturer la caisse' })).toBeInTheDocument();
    expect(screen.queryByText(/et non clôturée/)).not.toBeInTheDocument();
  });

  it('opens the closing dialog straight from the dashboard link (P-M2)', async () => {
    (caisseService.getCloturePreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      session_id: 3,
      fond_initial: 50000,
      expected_cash: 666000,
      fond_final_compte: null,
      ecart: null,
      par_methode: session.par_methode,
      orphan_mouvements: [],
      can_close: true,
    });
    renderPage('/caisse?magasin=1&cloture=1');

    expect(await screen.findByRole('dialog', { name: 'Clôturer la caisse' })).toBeInTheDocument();
    expect(caisseService.getCloturePreview).toHaveBeenCalledWith(3, undefined);
  });

  it('names the invoice and the client of each payment, never a database id (P-M4)', async () => {
    (caisseService.getMouvements as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        ...mouvements[0],
        facture_id: 96,
        numero_facture: 'FAC-2026-00096',
        tiers_id: 7,
        tiers_nom: 'Pharmacie de l’Indénié',
      },
      {
        id: 12,
        date_mouvement: '2026-10-23T13:09:00.000Z',
        type: 'encaissement',
        categorie: 'acompte_client',
        montant: '25000.00',
        methode_paiement: 'espece',
        libelle: 'Acompte client #17',
        tiers_id: 17,
        tiers_nom: 'Clinique Les Palmiers',
      },
    ]);
    renderPage();

    const links = await screen.findAllByRole('link', { name: 'Ouvrir la facture FAC-2026-00096' });
    expect(links[0]).toHaveAttribute('href', '/factures/96');
    expect(screen.getAllByText('Pharmacie de l’Indénié').length).toBeGreaterThan(0);
    // L'ancien libellé « Acompte client #17 » (17 = identifiant du contact) cède la place au nom.
    expect(screen.getAllByText('Clinique Les Palmiers').length).toBeGreaterThan(0);
    expect(screen.queryByText('Acompte client #17')).not.toBeInTheDocument();
    expect(screen.queryByText('Paiement facture #96')).not.toBeInTheDocument();
  });

  it('sends expenses to Dépenses from « Ajouter une sortie » (P-M3)', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Ajouter une sortie/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Ajouter une sortie' });
    expect(within(dialog).getByText(/Une dépense \(transport, fournitures, repas…\) \?/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Nouvelle dépense' })).toHaveAttribute('href', '/depenses?nouvelle=1');
    expect(within(dialog).getByRole('radio', { name: 'Autre sortie (hors dépense)' })).toBeInTheDocument();
  });

  it('titles the dialog after the button that opened it (P-M3)', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Ajouter une entrée/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Ajouter une entrée' });
    expect(within(dialog).queryByRole('link', { name: 'Nouvelle dépense' })).not.toBeInTheDocument();
  });

  it('offers a cashier no action on a stale session and says who must close it', async () => {
    (caisseService.getSessionActive as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...session,
      session_age_hours: 30,
      requires_manager_action: true,
    });
    renderPage();

    // La durée réelle, une seule fois.
    expect(await screen.findByText('Caisse ouverte depuis 30 heures')).toBeInTheDocument();
    expect(screen.getByText('Demandez à un gérant de la contrôler et de la clôturer.')).toBeInTheDocument();
    // Aucun bouton désactivé ne répète le bandeau : ni clôture, ni ajout de mouvement.
    expect(screen.queryByRole('button', { name: /Clôturer la caisse/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajouter une entrée/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajouter une sortie/ })).not.toBeInTheDocument();
  });

  it('lets a manager close a stale session from the header, without a second button in the banner', async () => {
    role = 'manager';
    (caisseService.getSessionActive as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...session,
      session_age_hours: 170,
      requires_manager_action: true,
    });
    renderPage();

    expect(await screen.findByText('Caisse ouverte depuis 7 jours')).toBeInTheDocument();
    const close = screen.getByRole('button', { name: /Clôturer la caisse/ });
    expect(close).toBeEnabled();
    expect(close).toHaveAttribute('aria-describedby', 'caisse-session-ancienne');
    expect(screen.queryByRole('button', { name: /Contrôler et clôturer/ })).not.toBeInTheDocument();
  });

  it('shows the drawer as one equation: fonds + entrées − sorties = espèces attendues', async () => {
    renderPage();
    await waitFor(() =>
      expect(textOf(screen.getByText('Espèces attendues en caisse').closest('.rounded-lg'))).toContain('666 000')
    );
    const tile = screen.getByText('Espèces attendues en caisse').closest('.rounded-lg');
    const text = textOf(tile);
    expect(text).toContain('Fonds initial');
    expect(text).toContain('50 000 FCFA');
    expect(text).toContain('Entrées en espèces');
    expect(text).toContain('680 900 FCFA');
    expect(text).toContain('Sorties en espèces');
    expect(text).toContain('64 900 FCFA');
  });

  it('says where, when and by whom the till was opened in one header line, instead of a card', async () => {
    (caisseService.getSessionActive as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...session,
      ouvert_par_nom: 'Adjoua Yao',
    });
    renderPage();
    await screen.findByText('Espèces attendues en caisse');

    const line = screen.getByText((_, el) => el?.tagName === 'P' && textOf(el).startsWith('MAG-PLT'));
    expect(textOf(line)).toBe(
      `MAG-PLT — Hitek Plateau · ouverte le ${norm(formatDateTime(session.date_ouverture))} par Adjoua Yao`
    );
    // Sous le titre de la page, à la place du sous-titre générique.
    expect(line.parentElement?.querySelector('h1')).toHaveTextContent('Caisse');
    expect(screen.queryByText('Ouvrez la caisse, enregistrez les mouvements, clôturez en fin de journée')).not.toBeInTheDocument();
    // La date ne se coupe jamais à 390 px ; le point médian reste collé au magasin.
    expect(within(line).getByText(formatDateTime(session.date_ouverture)).className).toContain('whitespace-nowrap');
    expect(line.textContent).toContain('Hitek Plateau\u00A0· ouverte le');

    // Plus de carte « Magasin / Ouverte le / Ouverte par / Fonds de caisse initial » :
    // le fonds initial ne s'affiche qu'une fois, en tête de la bande du tiroir.
    for (const label of ['Magasin', 'Ouverte le', 'Ouverte par', 'Fonds de caisse initial']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    expect(textOf(document.body).match(/(?<![\d ])50 000 FCFA/g)).toHaveLength(1);
  });

  it('leaves the shop out of the header line when the shop picker already shows it', async () => {
    (caisseService.getMagasins as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, code: 'MAG-PLT', nom: 'Hitek Plateau' },
      { id: 2, code: 'MAG-CCY', nom: 'Hitek Cocody' },
    ]);
    renderPage('/caisse?magasin=1');
    await screen.findByText('Espèces attendues en caisse');

    const line = screen.getByText((_, el) => el?.tagName === 'P' && textOf(el).startsWith('Ouverte le '));
    expect(textOf(line)).toMatch(/^Ouverte le .+ à \d{2}:\d{2} par a\.yao$/);
    expect(textOf(line)).not.toContain('Hitek Plateau');
  });

  it('keeps the generic subtitle while the till is closed', async () => {
    (caisseService.getSessionActive as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    renderPage();
    expect(await screen.findByText(/Caisse fermée/)).toBeInTheDocument();
    expect(screen.getByText('Ouvrez la caisse, enregistrez les mouvements, clôturez en fin de journée')).toBeInTheDocument();
  });

  it('paints the movement type as a neutral category, leaving colour to the signed amount', async () => {
    renderPage();
    await screen.findAllByText('Paiement facture #96');
    const table = screen.getByRole('table', { name: 'Mouvements de la session' });
    const entree = within(table).getAllByText('Entrée')[0];
    expect(entree.className).not.toMatch(/success|danger/);
  });
});
