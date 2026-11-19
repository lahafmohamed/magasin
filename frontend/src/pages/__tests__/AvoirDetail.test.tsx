import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AvoirDetail from '../AvoirDetail';

const auth = vi.hoisted(() => ({ user: { id: 2, role: 'manager' } as { id: number; role: string } }));

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: auth.user }),
  useOptionalAuth: () => ({ user: auth.user }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('../../services/api', () => ({
  creditNoteService: {
    getById: vi.fn(),
    applyToFacture: vi.fn(),
    refund: vi.fn(),
    downloadPdf: vi.fn(),
  },
  factureService: { getAll: vi.fn() },
  caisseService: { getMagasins: vi.fn(), getSessionActive: vi.fn() },
  companySettingsService: { get: vi.fn() },
}));

import { toast } from 'sonner';
import { caisseService, creditNoteService, factureService } from '../../services/api';

const avoir = (overrides: Record<string, unknown> = {}) => ({
  id: 4,
  numero_avoir: 'AVOIR-2026-00004',
  tiers_id: 7,
  client_nom: 'Pharmacie de l’Indénié',
  client_prenom: null,
  date_avoir: '2026-10-22',
  statut: 'valide',
  total: '40000',
  location_id: 1,
  location_nom: 'Hitek Plateau',
  facture_origine_id: 86,
  facture_origine_numero: 'FAC-2026-00086',
  avoir_type: 'retour',
  lignes: [
    {
      id: 1,
      produit_id: 5,
      produit_nom: 'Logitech B100',
      produit_reference: 'INF-SOU-001',
      quantite: 4,
      prix_unitaire: '10000',
      total_ligne: '40000',
    },
  ],
  remboursement: null,
  ...overrides,
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/avoirs/4']}>
      <Routes>
        <Route path="/avoirs/:id" element={<AvoirDetail />} />
      </Routes>
    </MemoryRouter>
  );

/** Texte d'un nœud, espaces insécables normalisés. */
const textOf = (el: Element | null) => (el?.textContent ?? '').replace(/[\u00A0\u202F]/g, ' ');

/** « Rembourser l’avoir » est rangé dans « Plus d’actions » : ouvre le menu et renvoie l'entrée, ou null. */
async function refundMenuItem(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Plus d’actions' }));
  await screen.findByRole('menuitem', { name: 'Télécharger le PDF' });
  return screen.queryByRole('menuitem', { name: 'Rembourser l’avoir' });
}

/** Ouvre la fenêtre de remboursement depuis « Plus d’actions ». */
async function openRefund() {
  const user = userEvent.setup();
  const item = await refundMenuItem(user);
  expect(item).not.toBeNull();
  await user.click(item!);
  return screen.findByRole('dialog');
}

describe('AvoirDetail — en-tête et informations (T2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: 2, role: 'manager' };
    vi.mocked(creditNoteService.getById).mockResolvedValue(avoir());
  });

  it('says client and date once, in the header, and keeps only the facts said nowhere else', async () => {
    renderPage();
    const client = await screen.findByRole('link', { name: 'Pharmacie de l’Indénié' });
    expect(client).toHaveAttribute('href', '/tiers/7');
    expect(textOf(client.closest('p')).trim()).toBe('Pharmacie de l’Indénié · 22 oct. 2026');

    // La facture d'origine n'est plus dite que dans le cycle du document, où elle reste un lien.
    expect(screen.getAllByText('FAC-2026-00086')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /FAC-2026-00086/ })).toHaveAttribute('href', '/factures/86');
    expect(screen.queryByText('Facture d’origine')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Informations' })).not.toBeInTheDocument();
    expect(screen.queryByText('Date de l’avoir')).not.toBeInTheDocument();

    // Le motif, lui, n'est dit nulle part ailleurs.
    expect(textOf(screen.getByText('Type').closest('div'))).toBe('TypeRetour marchandise');
  });

  it('shows no details card when there is nothing beyond the header and the lifecycle', async () => {
    vi.mocked(creditNoteService.getById).mockResolvedValue(avoir({ avoir_type: null }));
    renderPage();
    await screen.findByRole('heading', { level: 1, name: /AVOIR-2026-00004/ });
    // Ni motif, ni retour, ni imputation, ni remboursement : pas de carte vide.
    const terms = Array.from(document.querySelectorAll('dt')).map((dt) => textOf(dt));
    for (const label of ['Type', 'Retour client', 'Imputé sur', 'Remboursé au client']) {
      expect(terms).not.toContain(label);
    }
    expect(document.querySelector('dl.grid')).toBeNull();
  });
});

describe('AvoirDetail — rembourser l’avoir (E3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: 2, role: 'manager' };
    vi.mocked(creditNoteService.getById).mockResolvedValue(avoir());
    vi.mocked(caisseService.getMagasins).mockResolvedValue([{ id: 3, nom: 'Hitek Plateau', location_id: 1 }]);
    vi.mocked(caisseService.getSessionActive).mockResolvedValue({ id: 9 });
  });

  it('offers the imputation as the action and the refund in « Plus d’actions » on a valid credit note', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole('button', { name: /Imputer sur une facture/ })).toBeInTheDocument();
    // L'en-tête ne porte plus le remboursement en bouton : il rejoint le PDF dans le menu.
    expect(screen.queryByRole('button', { name: /Rembourser l’avoir/ })).not.toBeInTheDocument();
    expect(await refundMenuItem(user)).toBeInTheDocument();
  });

  it('hides both actions once the credit note is used, and says how it was refunded', async () => {
    vi.mocked(creditNoteService.getById).mockResolvedValue(
      avoir({
        statut: 'utilise',
        remboursement: {
          date: '2026-10-24T08:15:00',
          montant: 40000,
          methode_paiement: 'espece',
          reference: null,
          rembourse_par_nom: 'Moussa Koné',
        },
      })
    );
    renderPage();
    const label = await screen.findByText('Remboursé au client');
    const value = label.closest('div');
    expect(textOf(value)).toMatch(/40 000 FCFA en espèces/);
    expect(textOf(value)).toContain('par Moussa Koné');
    expect(screen.queryByRole('button', { name: /Imputer sur une facture/ })).not.toBeInTheDocument();
    expect(await refundMenuItem(userEvent.setup())).toBeNull();
  });

  it('never offers the refund to a role the API refuses', async () => {
    auth.user = { id: 5, role: 'magasin_staff' };
    renderPage();
    await screen.findByRole('heading', { level: 1, name: /AVOIR-2026-00004/ });
    expect(await refundMenuItem(userEvent.setup())).toBeNull();
  });

  it('refunds in cash from the open till, naming amount and method, and shows the server sentence', async () => {
    vi.mocked(creditNoteService.refund).mockResolvedValue({
      avoir_id: 4,
      numero_avoir: 'AVOIR-2026-00004',
      montant: 40000,
      methode_paiement: 'espece',
      mouvement_caisse_id: 77,
      message: 'Avoir AVOIR-2026-00004 remboursé : 40 000 FCFA en espèces.',
    });
    renderPage();
    const dialog = await openRefund();
    expect(within(dialog).getByRole('radio', { name: 'Espèces' })).toHaveAttribute('aria-checked', 'true');
    expect(await within(dialog).findByText(/Les espèces sortent de la caisse ouverte de Hitek Plateau/)).toBeInTheDocument();

    const submit = within(dialog).getByRole('button', { name: /Rembourser 40\s000\sFCFA en espèces/ });
    fireEvent.click(submit);

    await waitFor(() =>
      expect(creditNoteService.refund).toHaveBeenCalledWith(4, {
        methode_paiement: 'espece',
        reference: undefined,
        notes: undefined,
      })
    );
    expect(toast.success).toHaveBeenCalledWith('Avoir AVOIR-2026-00004 remboursé : 40 000 FCFA en espèces.');
    await waitFor(() => expect(creditNoteService.getById).toHaveBeenCalledTimes(2));
  });

  it('warns that the till is closed for cash, links to it, and lets another method through', async () => {
    vi.mocked(caisseService.getSessionActive).mockResolvedValue(null);
    vi.mocked(creditNoteService.refund).mockResolvedValue({
      avoir_id: 4,
      numero_avoir: 'AVOIR-2026-00004',
      montant: 40000,
      methode_paiement: 'virement',
      mouvement_caisse_id: null,
    });
    renderPage();
    const dialog = await openRefund();

    expect(
      await within(dialog).findByText(/La caisse de Hitek Plateau est fermée : ouvrez-la pour rembourser en espèces/)
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Ouvrir la caisse' })).toHaveAttribute('href', '/caisse');

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Virement' }));
    expect(within(dialog).queryByText(/est fermée/)).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Rembourser 40\s000\sFCFA par virement/ }));

    await waitFor(() =>
      expect(creditNoteService.refund).toHaveBeenCalledWith(4, expect.objectContaining({ methode_paiement: 'virement' }))
    );
    // Sans phrase du serveur : le toast nomme quand même l'avoir, le montant et le mode.
    expect(vi.mocked(toast.success).mock.calls[0][0]).toMatch(/AVOIR-2026-00004 remboursé : 40\s000\sFCFA par virement/);
  });

  it('turns a CAISSE_FERMEE refusal into the closed-till guidance, never a success', async () => {
    // Magasin non affecté à ce gérant : seule la réponse du serveur le nomme.
    vi.mocked(caisseService.getMagasins).mockResolvedValue([]);
    vi.mocked(creditNoteService.refund).mockRejectedValue({
      response: {
        status: 409,
        data: {
          success: false,
          error: 'La caisse de Hitek Cocody est fermée : ouvrez-la avant de rembourser des espèces.',
          code: 'CAISSE_FERMEE',
          magasin_id: 2,
          magasin_nom: 'Hitek Cocody',
        },
      },
    });
    renderPage();
    const dialog = await openRefund();
    fireEvent.click(within(dialog).getByRole('button', { name: /Rembourser 40\s000\sFCFA en espèces/ }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(/La caisse de Hitek Cocody est fermée : ouvrez-la pour rembourser en espèces/);
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('imputes on the chosen invoice — a paid one included — and toasts what the server booked (E1)', async () => {
    vi.mocked(factureService.getAll).mockResolvedValue({
      data: [
        { id: 109, numero_facture: 'FAC-2026-00109', tiers_id: 7, statut: 'payee', remaining_due: '0', total: '32000' },
        { id: 110, numero_facture: 'FAC-2026-00110', tiers_id: 8, statut: 'en_attente', remaining_due: '5000' },
        { id: 111, numero_facture: 'FAC-2026-00111', tiers_id: 7, statut: 'annulee', remaining_due: '0' },
      ],
    });
    vi.mocked(creditNoteService.applyToFacture).mockResolvedValue({
      message: 'La facture FAC-2026-00109 est déjà soldée : les 40 000 FCFA de l’avoir AVOIR-2026-00004 passent au crédit du client.',
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Imputer sur une facture/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/tout le montant si la facture est déjà payée/)).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Facture'), { target: { value: 'FAC' } });
    const options = await within(dialog).findAllByRole('option');
    // Même client, payée comprise ; ni l'autre client ni la facture annulée.
    expect(options.map((o) => o.textContent)).toEqual([expect.stringContaining('FAC-2026-00109')]);
    fireEvent.click(options[0]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Imputer l’avoir' }));

    await waitFor(() => expect(creditNoteService.applyToFacture).toHaveBeenCalledWith(4, 109));
    expect(toast.success).toHaveBeenCalledWith(
      'La facture FAC-2026-00109 est déjà soldée : les 40 000 FCFA de l’avoir AVOIR-2026-00004 passent au crédit du client.'
    );
  });
});
