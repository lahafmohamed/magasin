import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DemandeForm from '../DemandeForm';
import { demandeService } from '../../services/api';

vi.mock('../../services/api', () => ({
  demandeService: {
    getById: vi.fn(),
    getDepotStock: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    send: vi.fn(),
  },
  stockLocationService: {
    getAll: vi.fn().mockResolvedValue([
      { id: 1, code: 'DEP-VRD', nom: 'Dépôt Vridi', location_type: 'depot', est_principal: true, actif: true },
      { id: 2, code: 'MAG-PLT', nom: 'Hitek Plateau', location_type: 'magasin', est_principal: false, actif: true },
    ]),
  },
  caisseService: { getMagasins: vi.fn().mockResolvedValue([{ location_id: 2 }]) },
}));

const auth: { user: { id: number; role: string } } = { user: { id: 9, role: 'magasin_staff' } };
vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => auth,
  useOptionalAuth: () => auth,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

function renderNew() {
  return render(
    <MemoryRouter initialEntries={['/demandes/nouvelle']}>
      <Routes>
        <Route path="/demandes/nouvelle" element={<DemandeForm />} />
        <Route path="/demandes/:id" element={<p>Fiche de la demande</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Nouvelle demande de réapprovisionnement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(demandeService.getDepotStock).mockResolvedValue([
      { produit_id: 101, reference: 'SOU-SF', produit_nom: 'Souris sans fil', quantite_disponible: 12 },
    ]);
    vi.mocked(demandeService.create).mockResolvedValue({ id: 12, numero: 'DEM-2026-00012' });
    vi.mocked(demandeService.send).mockResolvedValue(undefined);
  });

  it('asks for the notes in the request summary, right above « Envoyer au dépôt »', async () => {
    renderNew();
    const notes = await screen.findByLabelText('Notes pour le dépôt');
    const summary = notes.closest('.rounded-lg') as HTMLElement;
    expect(within(summary).getByRole('heading', { level: 2, name: 'Produits demandés' })).toBeInTheDocument();
    const send = within(summary).getByRole('button', { name: 'Envoyer au dépôt' });
    expect(notes.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Plus de carte à part pour un seul champ.
    expect(screen.queryByRole('heading', { name: 'Notes pour le dépôt' })).toBeNull();
  });

  it('saves the notes with the draft', async () => {
    renderNew();
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter Souris sans fil à la demande' }));
    fireEvent.change(screen.getByLabelText('Notes pour le dépôt'), { target: { value: 'Rupture en vitrine depuis lundi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    await waitFor(() =>
      expect(demandeService.create).toHaveBeenCalledWith({
        magasin_id: 2,
        depot_id: 1,
        motif: 'Rupture en vitrine depuis lundi',
        lignes: [{ produit_id: 101, quantite_demandee: 1, notes: undefined }],
      })
    );
    expect(demandeService.send).not.toHaveBeenCalled();
    expect(await screen.findByText('Fiche de la demande')).toBeInTheDocument();
  });

  it('sends the notes with the request', async () => {
    renderNew();
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter Souris sans fil à la demande' }));
    fireEvent.change(screen.getByLabelText('Notes pour le dépôt'), { target: { value: 'Client en attente' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer au dépôt' }));
    await waitFor(() => expect(demandeService.send).toHaveBeenCalledWith(12));
    expect(demandeService.create).toHaveBeenCalledWith(expect.objectContaining({ motif: 'Client en attente' }));
  });
});
