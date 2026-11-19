import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

const auth = vi.hoisted(() => ({ role: 'caissier' }));
vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: auth.role }, hasRole: (...r: string[]) => r.includes(auth.role) }),
  useOptionalAuth: () => ({ user: { id: 1, role: auth.role }, hasRole: (...r: string[]) => r.includes(auth.role) }),
}));
vi.mock('../lib/ModulesContext', () => ({
  useModules: () => ({ estCheminActif: () => true }),
}));

const page = (rows: unknown[]) => ({ data: rows, pagination: { total: rows.length, totalPages: 1 } });
vi.mock('../services/api', () => ({
  produitService: { searchFuzzy: vi.fn() },
  tiersService: { search: vi.fn() },
  factureService: { getAll: vi.fn() },
  devisService: { getAll: vi.fn() },
  bonLivraisonService: { getAll: vi.fn() },
  commandeService: { getAll: vi.fn() },
  creditNoteService: { getAll: vi.fn() },
}));

import { GlobalSearch } from './GlobalSearch';
import {
  produitService,
  tiersService,
  factureService,
  devisService,
  bonLivraisonService,
  commandeService,
  creditNoteService,
} from '../services/api';

function openPalette() {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  });
  return screen.getByRole('combobox', { name: /rechercher dans toute l’application/i });
}

describe('GlobalSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (produitService.searchFuzzy as any).mockResolvedValue([{ id: 3, nom: 'Facturette HP', reference: 'INF-003' }]);
    (factureService.getAll as any).mockResolvedValue(page([{ id: 110, numero_facture: 'FAC-2026-00110', client_nom: 'BAMBA', total: 1000 }]));
    for (const svc of [devisService, bonLivraisonService, commandeService, creditNoteService]) {
      (svc.getAll as any).mockResolvedValue(page([]));
    }
    (tiersService.search as any).mockResolvedValue([]);
  });

  it('n’interroge que les sources que le rôle peut ouvrir, une fois la frappe terminée', async () => {
    auth.role = 'caissier';
    render(<GlobalSearch />);
    const input = openPalette();
    fireEvent.change(input, { target: { value: 'fa' } });
    // Débounce : rien n'est parti immédiatement.
    expect(factureService.getAll).not.toHaveBeenCalled();

    await screen.findByText('FAC-2026-00110');
    expect(factureService.getAll).toHaveBeenCalledTimes(1);
    expect(produitService.searchFuzzy).toHaveBeenCalledTimes(1);
    // Contacts, devis, BL, commandes et avoirs : pages refusées au caissier.
    expect(tiersService.search).not.toHaveBeenCalled();
    expect(devisService.getAll).not.toHaveBeenCalled();
    expect(bonLivraisonService.getAll).not.toHaveBeenCalled();
    expect(commandeService.getAll).not.toHaveBeenCalled();
    expect(creditNoteService.getAll).not.toHaveBeenCalled();
  });

  it('propose les pages du menu du rôle dans « Aller à »', async () => {
    auth.role = 'caissier';
    render(<GlobalSearch />);
    const input = openPalette();
    fireEvent.change(input, { target: { value: 'caiss' } });
    expect(await screen.findByRole('option', { name: /^Caisse$/ })).toBeInTheDocument();
    // L'historique des caisses est réservé aux responsables.
    expect(screen.queryByRole('option', { name: /Historique des caisses/ })).not.toBeInTheDocument();
  });

  it('ouvre le résultat choisi au clavier', async () => {
    auth.role = 'manager';
    render(<GlobalSearch />);
    const input = openPalette();
    fireEvent.change(input, { target: { value: 'FAC-2026' } });
    await screen.findByText('FAC-2026-00110');
    await waitFor(() => expect(input).toHaveAttribute('aria-activedescendant'));
    // L'option active se voit au clavier : anneau `ring` (GV-01), pas un fond seul.
    const active = document.getElementById(input.getAttribute('aria-activedescendant')!);
    expect(active).toHaveClass('ring-2', 'ring-inset', 'ring-ring');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigate).toHaveBeenCalledWith('/factures/110');
  });

  it('annonce l’absence de résultat avec la requête', async () => {
    auth.role = 'manager';
    (factureService.getAll as any).mockResolvedValue(page([]));
    (produitService.searchFuzzy as any).mockResolvedValue([]);
    render(<GlobalSearch />);
    const input = openPalette();
    fireEvent.change(input, { target: { value: 'zzzz' } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Aucun résultat pour « zzzz ».'));
  });
});
