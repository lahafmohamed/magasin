import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RouteAccessGate, NotFoundPage } from './ProtectedRoute';

const auth = vi.hoisted(() => ({ role: 'caissier' }));
vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({
    user: { role: auth.role },
    hasRole: (...roles: string[]) => roles.includes(auth.role),
  }),
  useOptionalAuth: () => ({
    user: { role: auth.role },
    hasRole: (...roles: string[]) => roles.includes(auth.role),
  }),
}));

describe('garde d’accès par rôle', () => {
  it('affiche la page quand le rôle est autorisé', () => {
    auth.role = 'magasin_staff';
    render(
      <MemoryRouter>
        <RouteAccessGate roles={['admin', 'manager', 'magasin_staff']}>
          <p>Liste des devis</p>
        </RouteAccessGate>
      </MemoryRouter>
    );
    expect(screen.getByText('Liste des devis')).toBeInTheDocument();
  });

  it('remplace la page refusée par « Accès réservé » avec un chemin de retour', () => {
    auth.role = 'caissier';
    render(
      <MemoryRouter>
        <RouteAccessGate roles={['admin', 'manager', 'magasin_staff']}>
          <p>Liste des devis</p>
        </RouteAccessGate>
      </MemoryRouter>
    );
    expect(screen.queryByText('Liste des devis')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /Accès réservé/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retour au tableau de bord' })).toHaveAttribute('href', '/');
  });

  it('laisse passer une route ouverte à tous', () => {
    auth.role = 'depot_staff';
    render(
      <MemoryRouter>
        <RouteAccessGate roles={null}>
          <p>Inventaire</p>
        </RouteAccessGate>
      </MemoryRouter>
    );
    expect(screen.getByText('Inventaire')).toBeInTheDocument();
  });

  it('propose le retour au tableau de bord sur une adresse inconnue', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 1, name: /Page introuvable/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retour au tableau de bord' })).toBeInTheDocument();
  });
});
