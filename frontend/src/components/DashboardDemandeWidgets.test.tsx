import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardDemandeWidgets } from './DashboardDemandeWidgets';
import { demandeService } from '../services/api';

vi.mock('../services/api', () => ({ demandeService: { getAll: vi.fn() } }));

const auth: { user: { id: number; role: string } } = { user: { id: 3, role: 'caissier' } };
vi.mock('../lib/AuthContext', () => ({ useAuth: () => auth, useOptionalAuth: () => auth }));

const demande = (id: number, statut: string) => ({
  id,
  numero: `DEM-2026-0000${id}`,
  statut,
  date_creation: '2026-10-23',
  magasin_nom: 'Hitek Plateau',
  depot_nom: 'Dépôt Vridi',
});

const page = (rows: ReturnType<typeof demande>[]) => ({
  data: rows,
  pagination: { page: 1, limit: 100, total: rows.length, totalPages: 1 },
});

function renderWidget() {
  return render(
    <MemoryRouter>
      <DashboardDemandeWidgets />
    </MemoryRouter>
  );
}

/** Lignes « À faire » : [texte du lien, destination]. */
async function todoRows() {
  const list = await screen.findByRole('list', { name: 'À faire' });
  return within(list)
    .getAllByRole('link')
    .map((link) => [link.textContent, link.getAttribute('href')]);
}

describe('DashboardDemandeWidgets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(demandeService.getAll).mockResolvedValue(
      page([demande(1, 'envoyee'), demande(2, 'envoyee'), demande(3, 'approuvee'), demande(4, 'livree')])
    );
  });

  it('does not invite a cashier to create or move a demande the API will not let them handle', async () => {
    auth.user = { id: 3, role: 'caissier' };
    renderWidget();
    expect(await screen.findByText('Demandes récentes')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nouvelle demande' })).toBeNull();
    // Aucune file à son nom : ni lignes « À faire », ni phrase « rien à faire ».
    expect(screen.queryByText('À faire')).toBeNull();
    expect(screen.getByRole('link', { name: /Envoyées/ })).toHaveAttribute('href', '/demandes?statut=envoyee');
  });

  it('points the depot’s « À faire » rows to the filtered lists, as quiet links', async () => {
    auth.user = { id: 7, role: 'depot_staff' };
    renderWidget();
    // Pas de clôture (elle revient au magasin), pas de brouillon (le dépôt n'en crée pas).
    expect(await todoRows()).toEqual([
      ['2 à décider : demandes', '/demandes?statut=envoyee'],
      ['1 à exécuter : demandes', '/demandes?statut=approuvee'],
    ]);
    const row = screen.getByRole('link', { name: '2 à décider : demandes' });
    // Un lien de file, pas un bouton : ni aplat, ni cadre.
    expect(row).not.toHaveClass('bg-primary');
    expect(row).not.toHaveClass('border');
    expect(within(row).getByText('2')).toHaveClass('tabular-nums');
    expect(screen.queryByRole('link', { name: 'Nouvelle demande' })).toBeNull();
  });

  it('gives the manager one card: « À faire » rows, the count by status, « Nouvelle demande » in its header', async () => {
    auth.user = { id: 1, role: 'manager' };
    vi.mocked(demandeService.getAll).mockResolvedValue(
      page([
        demande(1, 'envoyee'),
        demande(2, 'approuvee'),
        demande(3, 'partiellement_approuvee'),
        demande(4, 'livree'),
        demande(5, 'brouillon'),
        demande(6, 'brouillon'),
      ])
    );
    render(
      <MemoryRouter>
        <DashboardDemandeWidgets seeAll={<a href="/demandes">Tout voir</a>} />
      </MemoryRouter>
    );
    expect(await todoRows()).toEqual([
      ['1 à décider : demandes', '/demandes?statut=envoyee'],
      // Approuvées et partiellement approuvées : la liste complète.
      ['2 à exécuter : demandes', '/demandes'],
      ['1 à clôturer : demandes', '/demandes?statut=livree'],
      ['2 brouillons à envoyer : demandes', '/demandes?statut=brouillon'],
    ]);
    // Plus de cartes d'action ni de boutons « Voir les demandes à … ».
    expect(screen.queryByText(/Voir les demandes à/)).toBeNull();

    // « Nouvelle demande » : un contour (le bouton plein de la page est
    // « Nouvelle facture »), dans l'en-tête de la carte des demandes.
    const create = screen.getByRole('link', { name: 'Nouvelle demande' });
    expect(create).toHaveAttribute('href', '/demandes/nouvelle');
    expect(create).not.toHaveClass('bg-primary');
    expect(create).toHaveClass('border');
    const card = screen.getByRole('heading', { name: 'Demandes de réapprovisionnement' }).closest('.card-header');
    expect(card).toContainElement(create);

    // Le décompte par statut reste, sous son propre libellé.
    const byStatus = screen.getByRole('list', { name: 'Par statut' });
    expect(within(byStatus).getByRole('link', { name: 'Brouillons 2' })).toHaveAttribute(
      'href',
      '/demandes?statut=brouillon'
    );

    // « Tout voir » rejoint l'en-tête « Demandes récentes » ; plus de bouton pleine largeur en bas.
    const recentHeader = screen.getByRole('heading', { name: 'Demandes récentes' }).parentElement;
    expect(recentHeader).toContainElement(screen.getByRole('link', { name: 'Tout voir' }));
    expect(screen.queryByText(/Voir toutes les demandes/)).toBeNull();
  });

  it('omits an empty queue instead of showing « 0 à … »', async () => {
    auth.user = { id: 1, role: 'manager' };
    renderWidget();
    expect(await todoRows()).toEqual([
      ['2 à décider : demandes', '/demandes?statut=envoyee'],
      ['1 à exécuter : demandes', '/demandes?statut=approuvee'],
      ['1 à clôturer : demandes', '/demandes?statut=livree'],
    ]);
    expect(screen.queryByText(/brouillons? à envoyer/)).toBeNull();
  });

  it('says in one muted line when nothing waits, and still offers « Nouvelle demande »', async () => {
    auth.user = { id: 1, role: 'manager' };
    vi.mocked(demandeService.getAll).mockResolvedValue(page([demande(1, 'cloturee'), demande(2, 'refusee')]));
    renderWidget();
    expect(await screen.findByText('Aucune demande à faire avancer pour le moment')).toHaveClass(
      'text-muted-foreground'
    );
    expect(screen.queryByRole('list', { name: 'À faire' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Nouvelle demande' })).toBeInTheDocument();
  });

  it('shows where the goods go — from the depot to the shop — with the number in mono', async () => {
    auth.user = { id: 1, role: 'manager' };
    renderWidget();
    const code = await screen.findByText('DEM-2026-00001');
    expect(code).toHaveClass('font-mono');
    expect(code.closest('a')).toHaveTextContent(/Dépôt Vridi\s*vers\s*Hitek Plateau/);
  });

  it('shows an error with a retry instead of an empty summary, and keeps « Nouvelle demande »', async () => {
    auth.user = { id: 1, role: 'manager' };
    vi.mocked(demandeService.getAll).mockRejectedValue(new Error('réseau'));
    renderWidget();
    expect(await screen.findByText('Impossible de charger les demandes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Réessayer/ })).toBeInTheDocument();
    // Ni file ni décompte sur une donnée absente.
    expect(screen.queryByText('À faire')).toBeNull();
    expect(screen.queryByText('Par statut')).toBeNull();
    // Créer une demande ne dépend pas du décompte.
    expect(screen.getByRole('link', { name: 'Nouvelle demande' })).toBeInTheDocument();
  });
});
