import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ModuleGuard } from './ModuleGuard';
import { moduleForPath } from '@/config/modules';

/**
 * Garde d'accès par URL (phase 1 du plan v1). Masquer l'entrée de menu ne
 * suffit pas : un signet, une adresse tapée à la main ou un lien d'ancien
 * e-mail ouvraient encore l'écran d'un module masqué — et la page se montait
 * même le temps que les paramètres arrivent.
 */
const modules = vi.hoisted(() => ({
  masques: [] as string[],
  chargement: false,
}));
const acces = vi.hoisted(() => ({ parametres: true }));

vi.mock('@/lib/ModulesContext', () => ({
  useModules: () => ({
    chargement: modules.chargement,
    estCheminActif: (path: string) => {
      const key = moduleForPath(path);
      return !key || !modules.masques.includes(key);
    },
  }),
}));
vi.mock('@/hooks/useRouteAccess', () => ({
  useRouteAccess: () => (path: string) => (path === '/settings' ? acces.parametres : true),
}));

function ouvrir(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ModuleGuard>
        <p>Contenu de la page</p>
      </ModuleGuard>
    </MemoryRouter>
  );
}

describe('garde des modules masqués', () => {
  beforeEach(() => {
    modules.masques = ['paie', 'employes', 'comptabilite', 'tresorerie'];
    modules.chargement = false;
    acces.parametres = true;
  });

  it.each(['/paie', '/employes', '/general-ledger', '/tresorerie'])(
    'instance v1 : %s tapé à la main ne monte pas la page',
    (path) => {
      ouvrir(path);
      expect(screen.queryByText('Contenu de la page')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'Module non disponible' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Retour au tableau de bord' })).toHaveAttribute('href', '/');
    }
  );

  it('un module hors périmètre v1 ne promet pas une réactivation qui n’existe pas', () => {
    // Les paramètres n'ont pas de case pour lui : y renvoyer serait une impasse,
    // même pour l'administrateur.
    acces.parametres = true;
    ouvrir('/paie');
    expect(screen.queryByRole('link', { name: 'Ouvrir les paramètres de l’entreprise' })).not.toBeInTheDocument();
    expect(screen.queryByText(/réactiver/)).not.toBeInTheDocument();
    expect(screen.getByText(/n’est pas incluse dans votre installation/)).toBeInTheDocument();
    expect(screen.getByText(/contactez l’éditeur du logiciel/)).toBeInTheDocument();
  });

  it('ouvre les pages du cœur et celles hors catalogue', () => {
    for (const path of ['/factures', '/factures/12', '/vente-comptoir', '/profil', '/settings', '/']) {
      const { unmount } = ouvrir(path);
      expect(screen.getByText('Contenu de la page'), path).toBeInTheDocument();
      unmount();
    }
  });

  it('pendant le chargement des paramètres, une page couverte par un module attend', () => {
    modules.chargement = true;
    modules.masques = []; // on ne sait pas encore
    ouvrir('/devis');
    expect(screen.queryByText('Contenu de la page')).not.toBeInTheDocument();
    expect(screen.queryByText(/Module désactivé/)).not.toBeInTheDocument();
    // Le cadre porte déjà le nom de la page ; l'attente est annoncée.
    expect(screen.getByRole('heading', { level: 1, name: 'Devis' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Chargement…');
  });

  it('pendant le chargement, un module hors périmètre v1 n’est même pas nommé', () => {
    modules.chargement = true;
    ouvrir('/paie');
    expect(screen.queryByText('Contenu de la page')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Chargement' })).toBeInTheDocument();
    expect(screen.queryByText('Paie')).not.toBeInTheDocument();
  });

  it('pendant le chargement, les pages hors catalogue s’ouvrent sans attendre', () => {
    modules.chargement = true;
    ouvrir('/profil');
    expect(screen.getByText('Contenu de la page')).toBeInTheDocument();
  });

  it('un module masqué par le client propose les paramètres à qui peut le réactiver, pas aux autres', () => {
    modules.masques = ['devis'];
    const { unmount } = ouvrir('/devis');
    expect(screen.getByRole('heading', { level: 1, name: 'Module désactivé' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir les paramètres de l’entreprise' })).toHaveAttribute('href', '/settings');
    unmount();

    acces.parametres = false;
    ouvrir('/devis');
    expect(screen.queryByRole('link', { name: 'Ouvrir les paramètres de l’entreprise' })).not.toBeInTheDocument();
    expect(screen.getByText(/désactivée par votre administrateur/)).toBeInTheDocument();
  });
});
