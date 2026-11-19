import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import Receptions from '../Receptions';
import { receptionService, stockLocationService } from '../../services/api';

vi.mock('../../services/api', () => ({
  receptionService: {
    getPending: vi.fn(),
    getOrderDetails: vi.fn(),
    create: vi.fn(),
  },
  stockLocationService: { getAll: vi.fn() },
}));

const auth: { user: { id: number; role: string } } = { user: { id: 4, role: 'depot_staff' } };
vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => auth,
  useOptionalAuth: () => auth,
}));

const confirmMock = vi.fn().mockResolvedValue(true);
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => confirmMock }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const order = {
  id: 6,
  numero_commande: 'CMD-2026-00006',
  fournisseur_nom: 'HP Côte d’Ivoire SA',
  date_commande: '2026-10-19',
  statut: 'validee',
  lignes: [
    {
      id: 11,
      produit_id: 21,
      produit_nom: 'Écran 24 pouces',
      produit_reference: 'ECR-24',
      code_barre: null,
      quantite: 10,
      prix_unitaire: '85000',
      quantite_deja_recue: 4,
      quantite_restante: 6,
    },
    {
      id: 12,
      produit_id: 22,
      produit_nom: 'Clavier USB',
      produit_reference: 'CLV-01',
      code_barre: null,
      quantite: 5,
      prix_unitaire: '6000',
      quantite_deja_recue: 5,
      quantite_restante: 0,
    },
  ],
};

function renderForm() {
  return render(
    <MemoryRouter initialEntries={['/receptions?commande_id=6']}>
      <Receptions />
    </MemoryRouter>
  );
}

/** Le champ de la vue tableau (les cartes mobiles portent un second champ). */
const qtyInput = () => document.getElementById('reception-qty-11') as HTMLInputElement;

describe('Réception d’une commande fournisseur (U-20)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    auth.user.role = 'depot_staff';
    confirmMock.mockResolvedValue(true);
    vi.mocked(receptionService.getPending).mockResolvedValue([]);
    vi.mocked(receptionService.getOrderDetails).mockResolvedValue(order);
    vi.mocked(stockLocationService.getAll).mockResolvedValue([
      { id: 1, code: 'DEP-VRD', nom: 'Dépôt Vridi', est_principal: true, actif: true },
    ]);
  });

  it('shows ordered, already received and remaining quantities, and prefills the remainder', async () => {
    renderForm();
    const table = await screen.findByRole('table', { name: 'Produits de la commande CMD-2026-00006' });
    for (const header of ['Commandé', 'Déjà reçu', 'Reste', 'Reçu maintenant']) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    await waitFor(() => expect(qtyInput().value).toBe('6'));
    expect(qtyInput().max).toBe('6');
    // Ligne déjà entièrement reçue : plus de saisie.
    expect(document.getElementById('reception-qty-12')).toBeNull();
    expect(within(table).getByText('Reçu')).toBeInTheDocument();
  });

  it('caps the entry at the remainder and does not send an over-receipt', async () => {
    renderForm();
    await waitFor(() => expect(qtyInput()).not.toBeNull());
    fireEvent.change(qtyInput(), { target: { value: '7' } });
    expect((await screen.findAllByText('Reste à recevoir : 6 unités.')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Valider la réception' }));
    await waitFor(() => expect(confirmMock).not.toHaveBeenCalled());
    expect(receptionService.create).not.toHaveBeenCalled();
  });

  it('sends only the open lines and keeps the order open for a partial delivery', async () => {
    vi.mocked(receptionService.create).mockResolvedValue({ id: 99 });
    renderForm();
    await waitFor(() => expect(qtyInput().value).toBe('6'));
    fireEvent.change(qtyInput(), { target: { value: '2' } });
    expect(screen.getAllByText('Partiel').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Valider la réception' }));
    await waitFor(() => expect(receptionService.create).toHaveBeenCalled());
    expect(receptionService.create).toHaveBeenCalledWith({
      commande_id: 6,
      location_id: 1,
      lignes: [{ produit_id: 21, quantite_commandee: 10, quantite_recue: 2, cout_unitaire: 85000 }],
      notes: undefined,
    });
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('La commande restera ouverte pour le reliquat.') })
    );
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('attend le reliquat'));
  });

  it('surfaces the server’s OVER_RECEIPT reason and re-reads what was already received', async () => {
    vi.mocked(receptionService.create).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 422,
        data: {
          success: false,
          code: 'OVER_RECEIPT',
          error: 'Réception excessive pour « Écran 24 pouces » : reste à recevoir 3 (commandé 10, déjà reçu 7).',
        },
      },
    });
    renderForm();
    await waitFor(() => expect(qtyInput().value).toBe('6'));
    fireEvent.click(screen.getByRole('button', { name: 'Valider la réception' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Réception excessive pour « Écran 24 pouces » : reste à recevoir 3 (commandé 10, déjà reçu 7).'
      )
    );
    await waitFor(() => expect(receptionService.getOrderDetails).toHaveBeenCalledTimes(2));
  });

  it('shows an error with a retry when the pending orders cannot be loaded', async () => {
    vi.mocked(receptionService.getPending).mockRejectedValue(new Error('réseau'));
    render(
      <MemoryRouter initialEntries={['/receptions']}>
        <Receptions />
      </MemoryRouter>
    );
    expect(await screen.findByText('Impossible de charger les commandes à réceptionner')).toBeInTheDocument();
    expect(screen.queryByText('Aucune commande en attente de réception')).toBeNull();
  });
});

describe('Réceptions : le dépôt voit des quantités, pas des montants (E2)', () => {
  const pending = [
    {
      id: 6,
      numero_commande: 'CMD-2026-00006',
      fournisseur_nom: 'HP Côte d’Ivoire SA',
      date_commande: '2026-10-19',
      statut: 'validee',
      sous_total: '1034090.00',
      receptions_count: 0,
    },
  ];
  /** Texte visible, espaces insécables normalisés. */
  const bodyText = () => (document.body.textContent ?? '').replace(/[\u00A0\u202F]/g, ' ');

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    confirmMock.mockResolvedValue(true);
    vi.mocked(receptionService.getPending).mockResolvedValue(pending);
    vi.mocked(receptionService.getOrderDetails).mockResolvedValue(order);
    vi.mocked(receptionService.create).mockResolvedValue({ id: 99 });
    vi.mocked(stockLocationService.getAll).mockResolvedValue([
      { id: 1, code: 'DEP-VRD', nom: 'Dépôt Vridi', est_principal: true, actif: true },
    ]);
  });

  const renderList = () =>
    render(
      <MemoryRouter initialEntries={['/receptions']}>
        <Receptions />
      </MemoryRouter>
    );

  it('lists the orders to receive without their amount for depot staff', async () => {
    auth.user.role = 'depot_staff';
    renderList();
    expect((await screen.findAllByText('CMD-2026-00006')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('columnheader', { name: /Montant/ })).toBeNull();
    expect(screen.queryByText('Montant')).toBeNull();
    expect(bodyText()).not.toMatch(/FCFA|1 034 090/);
  });

  it('keeps the order amount for a manager', async () => {
    auth.user.role = 'manager';
    renderList();
    expect((await screen.findAllByText('CMD-2026-00006')).length).toBeGreaterThan(0);
    expect(screen.getByRole('columnheader', { name: /Montant/ })).toBeInTheDocument();
    expect(bodyText()).toMatch(/1 034 090 FCFA/);
  });

  it('confirms a depot reception in units only, without value or average cost jargon', async () => {
    auth.user.role = 'depot_staff';
    renderForm();
    await waitFor(() => expect(qtyInput().value).toBe('6'));
    // Barre d'action : des unités, aucun montant.
    expect(screen.getByText(/6 unités/).closest('p')?.textContent ?? '').toMatch(/reliquat à recevoir|commande soldée/);
    expect(bodyText()).not.toMatch(/FCFA/);
    fireEvent.click(screen.getByRole('button', { name: 'Valider la réception' }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    const { description } = confirmMock.mock.calls[0][0] as { description: string };
    expect(description).toBe('6 unités entreront dans le stock de Dépôt Vridi.');
    expect(description).not.toMatch(/FCFA|prix de revient/);
  });

  it('lets the server price a depot reception when the API strips the order price (E2)', async () => {
    auth.user.role = 'depot_staff';
    // R3-BE : les clés de montant sont retirées des réponses du dépôt.
    vi.mocked(receptionService.getOrderDetails).mockResolvedValue({
      ...order,
      lignes: order.lignes.map(({ prix_unitaire: _prix, ...ligne }) => ligne),
    });
    renderForm();
    await waitFor(() => expect(qtyInput().value).toBe('6'));
    fireEvent.click(screen.getByRole('button', { name: 'Valider la réception' }));

    await waitFor(() => expect(receptionService.create).toHaveBeenCalled());
    const payload = vi.mocked(receptionService.create).mock.calls[0][0];
    expect(payload.lignes).toEqual([{ produit_id: 21, quantite_commandee: 10, quantite_recue: 6 }]);
    expect(payload.lignes[0]).not.toHaveProperty('cout_unitaire');
  });

  it('gives a manager the value and the cost recalculation in the confirmation', async () => {
    auth.user.role = 'manager';
    renderForm();
    await waitFor(() => expect(qtyInput().value).toBe('6'));
    fireEvent.click(screen.getByRole('button', { name: 'Valider la réception' }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    const { description } = confirmMock.mock.calls[0][0] as { description: string };
    expect(description.replace(/[\u00A0\u202F]/g, ' ')).toContain('6 unités pour 510 000 FCFA entreront dans le stock de Dépôt Vridi.');
    expect(description).toContain('Le prix de revient moyen des produits sera recalculé.');
  });

  it('asks before discarding a reception that was typed into', async () => {
    auth.user.role = 'depot_staff';
    confirmMock.mockResolvedValue(false);
    renderForm();
    await waitFor(() => expect(qtyInput().value).toBe('6'));
    fireEvent.change(qtyInput(), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() =>
      expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ confirmLabel: 'Abandonner la saisie' }))
    );
    // Refusé : la saisie reste à l'écran.
    expect(qtyInput().value).toBe('2');
  });
});
