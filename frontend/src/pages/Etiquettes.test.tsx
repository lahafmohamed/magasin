import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Etiquettes from './Etiquettes';

vi.mock('../services/api', () => ({
  produitService: { searchFuzzy: vi.fn(), getById: vi.fn(), genererCodesBarres: vi.fn() },
}));
vi.mock('../utils/print', () => ({ printHtml: vi.fn() }));

let currentRole = 'manager';
vi.mock('../lib/AuthContext', () => ({
  useOptionalAuth: () => ({ user: { id: 1, role: currentRole }, hasRole: (...r: string[]) => r.includes(currentRole) }),
  useAuth: () => ({ user: { id: 1, role: currentRole }, hasRole: (...r: string[]) => r.includes(currentRole) }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { produitService } from '../services/api';
import { printHtml } from '../utils/print';

const mocked = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const robe = { id: 3, nom: 'Robe wax M', reference: 'RB-M', code_barre: '2000000000015', prix_vente: '15000.00', stock: 4 };
const jupe = { id: 4, nom: 'Jupe lin S', reference: 'JP-S', code_barre: null, prix_vente: '9000.00', stock: 2 };

function renderPage(url = '/etiquettes', role = 'manager') {
  currentRole = role;
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Etiquettes />
    </MemoryRouter>
  );
}

describe('Etiquettes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocked(produitService.getById).mockImplementation(async (id: number) => (id === 3 ? robe : jupe));
    mocked(produitService.searchFuzzy).mockImplementation(async (q: string) => (q === '2000000000015' ? [robe] : []));
    mocked(produitService.genererCodesBarres).mockResolvedValue({
      produits: [{ produit_id: 4, nom: 'Jupe lin S', code_barre: '2000000000022', cree: true }],
      message: '1 code-barres créé.',
    });
  });

  it('charge les produits passés par l’inventaire, crée le code manquant puis imprime la planche', async () => {
    const user = userEvent.setup();
    renderPage('/etiquettes?produits=3,4');

    expect(await screen.findByText('Robe wax M')).toBeInTheDocument();
    expect(screen.getByText('Jupe lin S')).toBeInTheDocument();
    expect(screen.getByText('1 produit n’a pas de code-barres : il ne sera pas imprimé.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imprimer 1 étiquette' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Créer le code-barres' }));
    await waitFor(() => expect(produitService.genererCodesBarres).toHaveBeenCalledWith([4]));
    expect(await screen.findByText('2000000000022')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Une étiquette par article en stock' }));
    const imprimer = screen.getByRole('button', { name: 'Imprimer 6 étiquettes' });
    expect(screen.getByText('6 étiquettes sur 1 planche')).toBeInTheDocument();

    await user.click(imprimer);
    expect(printHtml).toHaveBeenCalledTimes(1);
    const html = mocked(printHtml).mock.calls[0][0] as string;
    expect(html.split('<p class="nom">').length - 1).toBe(6);
    expect(html).toContain('@page { size: A4; margin: 0; }');
  });

  it('retient le format du poste et imprime sur rouleau sans le prix', async () => {
    const user = userEvent.setup();
    renderPage('/etiquettes?produits=3');
    await screen.findByText('Robe wax M');

    await user.click(screen.getByRole('radio', { name: 'Rouleau 50 × 30 mm' }));
    expect(localStorage.getItem('etiquettes:format')).toBe('rouleau-50x30');
    expect(screen.queryByLabelText('Commencer à l’étiquette n°')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Imprimer le prix de vente'));

    await user.click(screen.getByRole('button', { name: 'Imprimer 1 étiquette' }));
    const html = mocked(printHtml).mock.calls[0][0] as string;
    expect(html).toContain('@page { size: 50mm 30mm; margin: 0; }');
    expect(html).not.toContain('class="prix"');
  });

  it('ajoute un produit scanné et ne propose pas la création de code au vendeur', async () => {
    const user = userEvent.setup();
    renderPage('/etiquettes?produits=4', 'magasin_staff');
    await screen.findByText('Jupe lin S');
    expect(screen.queryByRole('button', { name: 'Créer le code-barres' })).not.toBeInTheDocument();
    expect(screen.getByText(/Demandez à un gérant de les créer/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imprimer les étiquettes' })).toBeDisabled();

    const search = screen.getByRole('combobox', { name: 'Ajouter un produit' });
    await user.click(search);
    await user.type(search, '2000000000015{Enter}');
    expect(await screen.findByText('Robe wax M')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imprimer 1 étiquette' })).toBeEnabled();
  });
});
