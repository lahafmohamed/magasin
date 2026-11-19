import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import FactureDetail from '../FactureDetail';

const auth = vi.hoisted(() => ({ user: { id: 1, role: 'admin' } as { id: number; role: string } }));
const confirmMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: auth.user }),
  useOptionalAuth: () => ({ user: auth.user }),
}));

vi.mock('@/components/ui/confirm-dialog', () => ({
  useConfirm: () => confirmMock,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('../../services/api', () => ({
  factureService: { getById: vi.fn(), updateStatut: vi.fn(), downloadPdf: vi.fn().mockResolvedValue(undefined) },
  paiementService: { create: vi.fn(), delete: vi.fn(), downloadRecu: vi.fn() },
  acompteService: { listForClient: vi.fn(), apply: vi.fn() },
  tiersService: { getById: vi.fn(), createCompensation: vi.fn() },
  caisseService: { getMagasins: vi.fn(), getSessionActive: vi.fn() },
  attachmentService: { list: vi.fn(), upload: vi.fn(), remove: vi.fn(), download: vi.fn() },
  companySettingsService: { get: vi.fn() },
}));

import { toast } from 'sonner';
import {
  acompteService,
  attachmentService,
  caisseService,
  factureService,
  paiementService,
  tiersService,
} from '../../services/api';

const facture = (overrides: Record<string, unknown> = {}) => ({
  id: 110,
  numero_facture: 'FAC-2026-00110',
  tiers_id: 7,
  client_nom: 'CompuServices SARL',
  client_prenom: null,
  date_facture: '2026-10-21',
  sous_total: '178000',
  tva: 0,
  total: '178000',
  montant_paye: '0',
  remaining_due: '178000',
  statut: 'en_attente',
  notes: null,
  location_id: 1,
  origine: null,
  lignes: [
    {
      id: 1,
      facture_id: 110,
      produit_id: 5,
      produit_nom: 'Acer V227Q',
      produit_reference: 'INF-MON-004',
      quantite: 2,
      prix_unitaire: '89000',
      total_ligne: '178000',
    },
  ],
  paiements: [],
  ...overrides,
});

const paiement = {
  id: 31,
  facture_id: 110,
  montant: '50000',
  methode_paiement: 'espece',
  date_paiement: '2026-10-22T10:00:00',
  reference: null,
  notes: null,
};

/** Texte d'un nœud, espaces insécables normalisés. */
const textOf = (el: Element | null) => (el?.textContent ?? '').replace(/[\u00A0\u202F]/g, ' ').trim();

const renderAt = (state?: unknown) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/factures/110', state }]}>
      <Routes>
        <Route path="/factures/:id" element={<FactureDetail />} />
      </Routes>
    </MemoryRouter>
  );

describe('FactureDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: 1, role: 'admin' };
    (factureService.getById as ReturnType<typeof vi.fn>).mockResolvedValue(facture());
    (acompteService.listForClient as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (tiersService.getById as ReturnType<typeof vi.fn>).mockResolvedValue({ est_fournisseur: false });
    (attachmentService.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (caisseService.getMagasins as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 3, location_id: 1 }]);
    (caisseService.getSessionActive as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 9 });
  });

  it('renders the invoice in the page shell with its status next to the title', async () => {
    renderAt();
    const h1 = await screen.findByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Facture FAC-2026-00110');
    expect(screen.getByText('Non payée')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer un paiement' })).toBeInTheDocument();
  });

  it('puts the due date on the header line, the client as a link, and drops the « Informations » card (T2)', async () => {
    (factureService.getById as ReturnType<typeof vi.fn>).mockResolvedValue(facture({ date_echeance: '2026-11-20' }));
    renderAt();

    const echeance = await screen.findByText('échéance 20 nov. 2026');
    const line = echeance.closest('p');
    expect(textOf(line)).toBe('CompuServices SARL · 21 oct. 2026 · échéance 20 nov. 2026');
    expect(within(line as HTMLElement).getByRole('link', { name: 'CompuServices SARL' })).toHaveAttribute(
      'href',
      '/tiers/7'
    );
    // La carte répétait le client et la date de l'en-tête : chaque fait n'est plus dit qu'une fois.
    expect(screen.queryByRole('heading', { name: 'Informations' })).not.toBeInTheDocument();
    expect(screen.queryByText('Date de facture')).not.toBeInTheDocument();
  });

  it('keeps the header line to client and date when the invoice has no due date', async () => {
    renderAt();
    const h1 = await screen.findByRole('heading', { level: 1 });
    const line = screen.getByRole('link', { name: 'CompuServices SARL' }).closest('p');
    expect(textOf(line)).toBe('CompuServices SARL · 21 oct. 2026');
    expect(h1).toHaveTextContent('Facture FAC-2026-00110');
  });

  it('offers « Annuler la facture » to an admin while nothing is paid (U-24)', async () => {
    const user = userEvent.setup();
    confirmMock.mockResolvedValue(true);
    (factureService.updateStatut as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    renderAt();

    await screen.findByRole('heading', { level: 1 });
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Créer un avoir' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('menuitem', { name: 'Annuler la facture' }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    const options = confirmMock.mock.calls[0][0];
    expect(options.confirmLabel).toBe('Annuler la facture');
    expect(options.destructive).toBe(true);
    // La conséquence (écritures contre-passées, articles remis en stock) est dite avant l'action.
    expect(options.description).toMatch(/contre-passées/);
    expect(options.description).toMatch(/reviennent en stock/);
    await waitFor(() => expect(factureService.updateStatut).toHaveBeenCalledWith(110, 'annulee'));
  });

  it('does not offer cancellation to a cashier', async () => {
    const user = userEvent.setup();
    auth.user = { id: 4, role: 'caissier' };
    renderAt();

    await screen.findByRole('heading', { level: 1 });
    // Le menu ne porte plus que le PDF : rien d'interdit au caissier.
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    expect(await screen.findByRole('menuitem', { name: 'Télécharger le PDF' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Annuler la facture' })).not.toBeInTheDocument();
  });

  it('downloads the server PDF of the invoice from « Plus d’actions »', async () => {
    const user = userEvent.setup();
    renderAt();

    await screen.findByRole('heading', { level: 1 });
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Télécharger le PDF' }));
    await waitFor(() => expect(factureService.downloadPdf).toHaveBeenCalledWith(110, 'FAC-2026-00110'));
  });

  it('offers « Créer un avoir » instead once the invoice is partly paid', async () => {
    const user = userEvent.setup();
    (factureService.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
      facture({ statut: 'partielle', montant_paye: '50000', remaining_due: '128000', paiements: [paiement] })
    );
    renderAt();

    await screen.findByRole('heading', { level: 1 });
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    const avoir = await screen.findByRole('menuitem', { name: 'Créer un avoir' });
    expect(avoir).toHaveAttribute('href', '/avoirs/nouveau?facture_id=110');
    expect(screen.queryByRole('menuitem', { name: 'Annuler la facture' })).not.toBeInTheDocument();
  });

  it('shows the delete-payment action to an admin only (U-13)', async () => {
    (factureService.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
      facture({ statut: 'partielle', montant_paye: '50000', remaining_due: '128000', paiements: [paiement] })
    );
    auth.user = { id: 2, role: 'manager' };
    const { unmount } = renderAt();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryAllByRole('button', { name: /Supprimer le paiement/ })).toHaveLength(0);
    unmount();

    auth.user = { id: 1, role: 'admin' };
    renderAt();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getAllByRole('button', { name: /Supprimer le paiement/ }).length).toBeGreaterThan(0);
  });

  it('records exactly the typed amount and toasts the server message (D3)', async () => {
    const message = 'Paiement de 10 000 FCFA enregistré en espèces. Reste dû : 168 000 FCFA.';
    (paiementService.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      message,
      montant_recu: 10000,
      direct_montant: 10000,
      applique_depuis_acomptes: 0,
      direct_paiement_id: 55,
      reste_du: 168000,
      statut_facture: 'partielle',
    });
    renderAt();

    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer un paiement' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Montant du paiement'), { target: { value: '10000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer le paiement' }));

    await waitFor(() =>
      expect(paiementService.create).toHaveBeenCalledWith(
        110,
        expect.objectContaining({ montant: 10000, methode_paiement: 'espece', idempotency_key: expect.any(String) })
      )
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        message,
        expect.objectContaining({ action: expect.objectContaining({ label: 'Imprimer le reçu' }) })
      )
    );
  });

  it('opens the payment entry by itself right after a counter sale (justCreated)', async () => {
    renderAt({ justCreated: true });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Enregistrer un paiement')).toBeInTheDocument();
  });

  it('warns before submitting when the shop till is closed (U-23)', async () => {
    auth.user = { id: 4, role: 'caissier' };
    (caisseService.getSessionActive as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    renderAt();

    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer un paiement' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText('La caisse est fermée : ouvrez-la pour encaisser des espèces.')
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Ouvrir la caisse' })).toHaveAttribute('href', '/caisse');
    expect(caisseService.getSessionActive).toHaveBeenCalledWith(3);
  });

  it('offers « Nouvelle vente » as the next step once the invoice is paid (P-M5)', async () => {
    auth.user = { id: 4, role: 'caissier' };
    (factureService.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
      facture({ statut: 'payee', montant_paye: '178000', remaining_due: '0', paiements: [paiement] })
    );
    renderAt();

    const next = await screen.findByRole('link', { name: 'Nouvelle vente' });
    expect(next).toHaveAttribute('href', '/factures/nouvelle');
    expect(screen.queryByRole('button', { name: 'Enregistrer un paiement' })).not.toBeInTheDocument();
  });

  it('keeps « Enregistrer un paiement » as the action while something is due', async () => {
    auth.user = { id: 4, role: 'caissier' };
    renderAt();
    expect(await screen.findByRole('button', { name: 'Enregistrer un paiement' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nouvelle vente' })).not.toBeInTheDocument();
  });

  it('shows a load failure with a retry instead of an empty invoice', async () => {
    (factureService.getById as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    renderAt();
    expect(await screen.findByText('Impossible de charger la facture')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});
