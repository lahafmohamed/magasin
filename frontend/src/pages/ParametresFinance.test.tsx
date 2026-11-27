import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ParametresFinance from './ParametresFinance';
import { factureFournisseurService, payrollService } from '@/services/api';

/**
 * La page réunit la configuration de la paie (CNPS, ITS) et les tolérances du
 * rapprochement fournisseur. La paie est hors périmètre v1 : sur une instance
 * neuve la page ne doit ni la montrer, ni interroger son API — sinon le module
 * masqué réapparaissait par cette porte de côté.
 */
const modules = vi.hoisted(() => ({ paie: false }));

vi.mock('@/services/api', () => ({
  payrollService: {
    getConfig: vi.fn(),
    updateCotisation: vi.fn(),
    createCotisation: vi.fn(),
    replaceBaremes: vi.fn(),
  },
  factureFournisseurService: {
    getMatchConfig: vi.fn(),
    updateMatchConfig: vi.fn(),
  },
}));
vi.mock('@/lib/ModulesContext', () => ({
  useModules: () => ({ estModuleActif: (key: string) => (key === 'paie' ? modules.paie : true) }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

describe('Paramètres paie et achats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modules.paie = false;
    vi.mocked(factureFournisseurService.getMatchConfig).mockResolvedValue({
      qte_tolerance_pct: 0,
      prix_tolerance_pct: 0.05,
      bloquer: false,
    });
    vi.mocked(payrollService.getConfig).mockResolvedValue({
      cotisations: [
        { id: 1, code: 'CNPS', libelle: 'Retraite', taux_salarial: 0.063, taux_patronal: 0.077, plafond: null, actif: true },
      ],
      baremes: [{ ordre: 1, tranche_min: 0, tranche_max: 75000, taux: 0 }],
    });
  });

  it('sans la paie : seules les tolérances d’achat, sous le nom « Paramètres achats »', async () => {
    render(<ParametresFinance />);

    expect(await screen.findByText('Contrôle commande, réception, facture')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Paramètres achats' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tolérance sur les quantités (%)')).toBeInTheDocument();

    expect(screen.queryByText(/CNPS/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ITS/)).not.toBeInTheDocument();
    expect(screen.queryByText(/paie/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter une cotisation' })).not.toBeInTheDocument();
    // Pas d'appel à l'API d'un module masqué.
    expect(payrollService.getConfig).not.toHaveBeenCalled();
  });

  it('avec la paie : cotisations et barème reviennent, sous le nom complet', async () => {
    modules.paie = true;
    render(<ParametresFinance />);

    expect(await screen.findByText('Cotisations sociales (CNPS)')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Paramètres paie et achats' })).toBeInTheDocument();
    expect(screen.getByText('Barème ITS (impôt progressif)')).toBeInTheDocument();
    expect(screen.getByText('Contrôle commande, réception, facture')).toBeInTheDocument();
    expect(payrollService.getConfig).toHaveBeenCalledTimes(1);
  });

  it('sans la paie, une panne de l’API de paie ne peut plus faire tomber la page', async () => {
    vi.mocked(payrollService.getConfig).mockRejectedValue(new Error('500'));
    render(<ParametresFinance />);
    expect(await screen.findByText('Contrôle commande, réception, facture')).toBeInTheDocument();
    expect(screen.queryByText('Impossible de charger les paramètres')).not.toBeInTheDocument();
  });
});
