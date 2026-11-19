import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DemandeDetail from '../DemandeDetail';
import { demandeService } from '../../services/api';

vi.mock('../../services/api', () => ({
  demandeService: {
    getById: vi.fn(),
    getDepotStock: vi.fn(),
    decide: vi.fn(),
    execute: vi.fn(),
    send: vi.fn(),
    cancel: vi.fn(),
    close: vi.fn(),
  },
}));

const auth: { user: { id: number; role: string } } = { user: { id: 2, role: 'manager' } };
vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => auth,
  useOptionalAuth: () => auth,
}));

const confirmMock = vi.fn().mockResolvedValue(true);
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => confirmMock }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

function demande(statut: string, extra: Record<string, unknown> = {}) {
  return {
    id: 6,
    numero: 'DEM-2026-00006',
    statut,
    magasin_id: 2,
    magasin_nom: 'Hitek Plateau',
    magasin_code: 'MAG-PLT',
    depot_id: 1,
    depot_nom: 'Dépôt Vridi',
    depot_code: 'DEP-VRD',
    created_by_user_id: 9,
    created_by_nom: 'Seydou Diallo',
    decided_by_nom: null,
    executed_by_nom: null,
    closed_by_nom: null,
    date_creation: '2026-10-23T08:00:00Z',
    date_envoi: '2026-10-23T08:05:00Z',
    date_decision: null,
    date_execution: null,
    date_livraison: null,
    date_cloture: null,
    motif: null,
    raison_refus: null,
    numero_transfer: null,
    transfert_id: null,
    lignes: [
      {
        id: 31,
        produit_id: 101,
        produit_nom: 'Souris sans fil',
        reference: 'SOU-SF',
        quantite_demandee: 5,
        quantite_approuvee: null,
        quantite_livree: null,
        notes: null,
      },
    ],
    historique: [],
    ...extra,
  };
}

function renderAt(url = '/demandes/6') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/demandes/:id" element={<DemandeDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Demande de réapprovisionnement — détail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmMock.mockResolvedValue(true);
    auth.user = { id: 2, role: 'manager' };
    vi.mocked(demandeService.getDepotStock).mockResolvedValue([
      { produit_id: 101, reference: 'SOU-SF', produit_nom: 'Souris sans fil', quantite_disponible: 3 },
    ]);
  });

  it('lets the manager decide a sent demande (D2)', async () => {
    vi.mocked(demandeService.getById).mockResolvedValue(demande('envoyee'));
    renderAt();
    expect(await screen.findByRole('button', { name: 'Prendre une décision' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Demande DEM-2026-00006' })).toBeInTheDocument();
  });

  it('lets the manager execute an approved demande, with a confirmation naming both places', async () => {
    vi.mocked(demandeService.getById).mockResolvedValue(demande('approuvee'));
    vi.mocked(demandeService.execute).mockResolvedValue({ transfert_id: 4, numero_transfer: 'TRA-2026-00004' });
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Exécuter le transfert' }));
    await waitFor(() => expect(demandeService.execute).toHaveBeenCalledWith(6));
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'Exécuter le transfert',
        description:
          'Les quantités approuvées quitteront le stock de Dépôt Vridi pour Hitek Plateau. Le magasin devra ensuite confirmer la réception.',
      })
    );
  });

  it('offers the owner of a draft to send or edit it, not to decide it', async () => {
    auth.user = { id: 9, role: 'magasin_staff' };
    vi.mocked(demandeService.getById).mockResolvedValue(demande('brouillon'));
    renderAt();
    expect(await screen.findByRole('button', { name: 'Envoyer au dépôt' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Modifier la demande' })).toHaveAttribute('href', '/demandes/6/edit');
    expect(screen.queryByRole('button', { name: 'Prendre une décision' })).toBeNull();
  });

  it('opens the decision with the depot stock, prefilled within it, and an outcome-named button (U-28)', async () => {
    vi.mocked(demandeService.getById).mockResolvedValue(demande('envoyee'));
    renderAt('/demandes/6?action=decider');
    const dialog = await screen.findByRole('dialog');
    // Décision exposée comme un groupe radio (A11Y-S03).
    const group = within(dialog).getByRole('radiogroup', { name: 'Décision' });
    expect(within(group).getByRole('radio', { name: /Approuver/ })).toHaveAttribute('aria-checked', 'true');
    // Pré-remplie à min(5 demandées, 3 au dépôt).
    const input = within(dialog).getByLabelText('Quantité approuvée — Souris sans fil') as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe('3'));
    expect(within(dialog).getByText(/Au dépôt : 3/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Approuver 3 sur 5 unités' })).toBeInTheDocument();

    fireEvent.click(within(group).getByRole('radio', { name: 'Refuser' }));
    const refuse = within(dialog).getByRole('button', { name: 'Refuser la demande' });
    fireEvent.click(refuse);
    expect(await within(dialog).findByText('Saisissez le motif du refus.')).toBeInTheDocument();
    expect(demandeService.decide).not.toHaveBeenCalled();
  });

  it('sends the decision with the approved quantities', async () => {
    vi.mocked(demandeService.getById).mockResolvedValue(demande('envoyee'));
    vi.mocked(demandeService.decide).mockResolvedValue(undefined);
    renderAt('/demandes/6?action=decider');
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('Quantité approuvée — Souris sans fil') as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe('3'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approuver 3 sur 5 unités' }));
    await waitFor(() =>
      expect(demandeService.decide).toHaveBeenCalledWith(6, {
        decision: 'approuvee',
        lignes_decision: [{ ligne_id: 31, quantite_approuvee: 3 }],
        raison_refus: undefined,
      })
    );
  });

  /** Historique complet d'une demande clôturée (du plus récent au plus ancien, comme l'API). */
  const fullHistory = [
    { id: 6, from_statut: 'livree', to_statut: 'cloturee', timestamp: '2026-10-23T13:08:00Z', username: 's.diallo', nom_complet: 'Seydou Diallo' },
    { id: 5, from_statut: 'en_cours', to_statut: 'livree', timestamp: '2026-10-23T13:07:00Z', username: 'k.ble', nom_complet: 'Koffi Blé' },
    { id: 4, from_statut: 'approuvee', to_statut: 'en_cours', timestamp: '2026-10-23T13:06:00Z', username: 'k.ble', nom_complet: 'Koffi Blé' },
    { id: 3, from_statut: 'envoyee', to_statut: 'approuvee', timestamp: '2026-10-23T13:05:00Z', username: 'k.ble', nom_complet: 'Koffi Blé' },
    { id: 2, from_statut: 'brouillon', to_statut: 'envoyee', timestamp: '2026-10-23T13:04:00Z', username: 's.diallo', nom_complet: 'Seydou Diallo' },
    { id: 1, from_statut: null, to_statut: 'brouillon', timestamp: '2026-10-23T13:03:00Z', username: 's.diallo', nom_complet: 'Seydou Diallo' },
  ];

  const closedDemande = () =>
    demande('cloturee', {
      decided_by_nom: 'Koffi Blé',
      executed_by_nom: 'Koffi Blé',
      closed_by_nom: 'Seydou Diallo',
      date_decision: '2026-10-23T13:05:00Z',
      date_execution: '2026-10-23T13:06:00Z',
      date_cloture: '2026-10-23T13:08:00Z',
      motif: 'Réassort vitrine Plateau',
      numero_transfer: 'TRA-2026-00002',
      transfert_id: 2,
      historique: fullHistory,
    });

  it('reads the products, then the magasin and the dépôt, then the history (phone order)', async () => {
    vi.mocked(demandeService.getById).mockResolvedValue(closedDemande());
    renderAt();
    const produits = await screen.findByRole('heading', { level: 2, name: 'Produits demandés' });
    const infos = screen.getByRole('heading', { level: 2, name: 'Informations' });
    const historique = screen.getByRole('heading', { level: 2, name: 'Historique' });
    expect(produits.compareDocumentPosition(infos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(infos.compareDocumentPosition(historique) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('leaves who did what to the history, and keeps the places, the transfer and the notes', async () => {
    vi.mocked(demandeService.getById).mockResolvedValue(closedDemande());
    renderAt();
    const infos = (await screen.findByRole('heading', { level: 2, name: 'Informations' })).closest('.rounded-lg') as HTMLElement;
    expect(within(infos).getByText('Hitek Plateau')).toBeInTheDocument();
    expect(within(infos).getByText('Dépôt Vridi')).toBeInTheDocument();
    expect(within(infos).getByText('TRA-2026-00002')).toBeInTheDocument();
    expect(within(infos).getByText('Réassort vitrine Plateau')).toBeInTheDocument();
    for (const label of ['Créée par', 'Envoyée le', 'Décision par', 'Transfert exécuté par', 'Clôturée par']) {
      expect(within(infos).queryByText(label)).toBeNull();
    }
    // Les mêmes personnes, une seule fois : dans l'historique.
    const historique = screen.getByRole('heading', { level: 2, name: 'Historique' }).closest('.rounded-lg') as HTMLElement;
    expect(within(historique).getByText('Créée en brouillon')).toBeInTheDocument();
    expect(within(historique).getByText('Clôturée')).toBeInTheDocument();
    expect(within(historique).getAllByText(/^Par Koffi Blé/)).toHaveLength(3);
  });

  it('keeps the author and the sending date when the history did not record them', async () => {
    vi.mocked(demandeService.getById).mockResolvedValue(demande('envoyee', { historique: [] }));
    renderAt();
    const infos = (await screen.findByRole('heading', { level: 2, name: 'Informations' })).closest('.rounded-lg') as HTMLElement;
    expect(within(infos).getByText('Créée par')).toBeInTheDocument();
    expect(within(infos).getByText('Seydou Diallo')).toBeInTheDocument();
    expect(within(infos).getByText('Envoyée le')).toBeInTheDocument();
    expect(screen.getByText('Aucun changement de statut enregistré')).toBeInTheDocument();
  });

  it('shows an error with a retry, and « Demande introuvable » on a 404', async () => {
    vi.mocked(demandeService.getById).mockRejectedValueOnce({ response: { status: 404, data: { error: 'Demande non trouvée' } } });
    renderAt();
    expect(await screen.findByRole('heading', { level: 1, name: 'Demande introuvable' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Retour aux demandes/ }).length).toBeGreaterThan(0);
  });
});
