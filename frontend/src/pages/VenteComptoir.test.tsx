import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import VenteComptoir from './VenteComptoir';

vi.mock('../services/api', () => ({
  factureService: { createVenteComptoir: vi.fn() },
  ventesService: { getLocations: vi.fn(), searchFuzzy: vi.fn() },
  stockLocationService: { getStockLevels: vi.fn() },
  tiersService: { getComptoir: vi.fn(), getById: vi.fn(), search: vi.fn(), createClient: vi.fn() },
  caisseService: { getMagasins: vi.fn(), getSessionActive: vi.fn() },
}));

vi.mock('../utils/ticket', () => ({ printTicket: vi.fn() }));

vi.mock('../lib/AuthContext', () => ({
  useOptionalAuth: () => ({ user: { id: 7, role: 'caissier' }, hasRole: (...r: string[]) => r.includes('caissier') }),
  useAuth: () => ({ user: { id: 7, role: 'caissier' }, hasRole: (...r: string[]) => r.includes('caissier') }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { caisseService, factureService, stockLocationService, tiersService, ventesService } from '../services/api';
import { printTicket } from '../utils/ticket';
import { toast } from 'sonner';

const mocked = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
const plain = (text: string | null | undefined) => (text ?? '').split(String.fromCharCode(0xa0)).join(' ').split(String.fromCharCode(0x202f)).join(' ');

const BARCODE = '3700000000011';
const tshirt = {
  id: 5,
  reference: 'TS-BL-M',
  nom: 'T-shirt bleu M',
  code_barre: BARCODE,
  prix_vente: '2500.00',
  prix_achat: '1200.00',
  stock: 10,
  stock_min: 1,
};
const comptoir = {
  id: 28,
  code: 'PASS',
  raison_sociale: 'Client comptoir',
  prenom: null,
  telephone: null,
  est_client: true,
  est_fournisseur: false,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/vente-comptoir']}>
      <VenteComptoir />
    </MemoryRouter>
  );
}

async function scan(user: ReturnType<typeof userEvent.setup>, code: string) {
  const search = screen.getByRole('combobox', { name: 'Ajouter un article' });
  await user.click(search);
  await user.type(search, `${code}{Enter}`);
}

describe('VenteComptoir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocked(ventesService.getLocations).mockResolvedValue([{ id: 1, code: 'MAG-1', nom: 'Boutique Cocody', est_principal: true }]);
    mocked(stockLocationService.getStockLevels).mockResolvedValue([{ produit_id: 5, quantite_disponible: 10 }]);
    mocked(ventesService.searchFuzzy).mockImplementation(async (q: string) => (q === BARCODE ? [tshirt] : []));
    mocked(tiersService.getComptoir).mockResolvedValue(comptoir);
    mocked(caisseService.getMagasins).mockResolvedValue([{ id: 3, location_id: 1, nom: 'Boutique Cocody' }]);
    mocked(caisseService.getSessionActive).mockResolvedValue({ id: 99 });
    mocked(factureService.createVenteComptoir).mockResolvedValue({
      idempotent: false,
      facture_id: 120,
      numero_facture: 'FAC-2026-00120',
      total: 5000,
      paiements: [{ paiement_id: 1, methode_paiement: 'espece', montant: 5000 }],
      especes_recues: 10000,
      monnaie_rendue: 5000,
      message: 'Vente FAC-2026-00120 : 5 000 FCFA payés en espèces.',
    });
  });

  it('scanne deux fois le même article, encaisse en espèces et affiche la monnaie à rendre', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Client comptoir');

    await scan(user, BARCODE);
    await screen.findByText('T-shirt bleu M');
    await scan(user, BARCODE);
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Quantité — T-shirt bleu M' })).toHaveValue('2')
    );

    await user.type(screen.getByLabelText('Espèces reçues'), '10000');
    expect(plain(screen.getByText('Monnaie à rendre').parentElement?.textContent)).toContain('5 000');

    await user.click(screen.getByRole('button', { name: /Encaisser/ }));

    await waitFor(() => expect(factureService.createVenteComptoir).toHaveBeenCalledTimes(1));
    const payload = mocked(factureService.createVenteComptoir).mock.calls[0][0];
    expect(payload).toMatchObject({
      tiers_id: undefined,
      location_id: 1,
      lignes: [{ produit_id: 5, quantite: 2, prix_unitaire: 2500 }],
      paiements: [{ methode_paiement: 'espece' }],
      especes_recues: 10000,
    });
    expect(payload.idempotency_key).toMatch(/^comptoir-/);

    const dialog = await screen.findByRole('dialog', { name: 'Vente enregistrée' });
    expect(within(dialog).getByText('FAC-2026-00120')).toBeInTheDocument();
    expect(printTicket).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Imprimer le ticket' }));
    expect(printTicket).toHaveBeenCalledWith(120, { especesRecues: 10000, monnaieRendue: 5000 });

    await user.click(within(dialog).getByRole('button', { name: 'Nouvelle vente' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Aucun article scanné')).toBeInTheDocument();
  });

  it('bloque les espèces quand la caisse du magasin est fermée, mais laisse payer par mobile money', async () => {
    mocked(caisseService.getSessionActive).mockResolvedValue(null);
    const user = userEvent.setup();
    renderPage();
    await scan(user, BARCODE);
    await screen.findByText('T-shirt bleu M');

    expect(await screen.findByText(/est fermée : ouvrez-la pour encaisser des espèces/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Encaisser/ })).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: 'Wave' }));
    const encaisser = screen.getByRole('button', { name: /Encaisser/ });
    expect(encaisser).toBeEnabled();
    await user.click(encaisser);
    await waitFor(() => expect(factureService.createVenteComptoir).toHaveBeenCalled());
    expect(mocked(factureService.createVenteComptoir).mock.calls[0][0]).toMatchObject({
      paiements: [{ methode_paiement: 'wave' }],
      especes_recues: undefined,
    });
  });

  it('refuse des espèces reçues inférieures au total', async () => {
    const user = userEvent.setup();
    renderPage();
    await scan(user, BARCODE);
    await screen.findByText('T-shirt bleu M');
    await user.type(screen.getByLabelText('Espèces reçues'), '1000');
    expect(screen.getByText('Il manque')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Encaisser/ })).toBeDisabled();
  });

  it('imprime le ticket automatiquement quand le poste le demande', async () => {
    localStorage.setItem('vente-comptoir:impression-auto', '1');
    const user = userEvent.setup();
    renderPage();
    await scan(user, BARCODE);
    await screen.findByText('T-shirt bleu M');
    await user.click(screen.getByRole('button', { name: /Encaisser/ }));
    await waitFor(() => expect(printTicket).toHaveBeenCalledWith(120, { especesRecues: 2500, monnaieRendue: 5000 }));
  });

  it('dit pourquoi la vente a échoué sans rien vider', async () => {
    mocked(factureService.createVenteComptoir).mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { error: 'Stock insuffisant pour « T-shirt bleu M » : 0 disponible(s) à cet emplacement, 1 demandé(s).' } },
    });
    const user = userEvent.setup();
    renderPage();
    await scan(user, BARCODE);
    await screen.findByText('T-shirt bleu M');
    await user.click(screen.getByRole('button', { name: /Encaisser/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByText('T-shirt bleu M')).toBeInTheDocument();
  });
});
