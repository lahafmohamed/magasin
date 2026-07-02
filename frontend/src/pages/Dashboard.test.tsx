import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from '../pages/Dashboard';

// Mock the API services Dashboard depends on. These are smoke-level mocks: the
// goal is that the page mounts, fetches, and renders without crashing — not to
// assert exact copy/formatting, which churns with every UI redesign.
vi.mock('../services/api', () => ({
  factureService: {
    getStats: vi.fn(),
    getRevenueTrends: vi.fn(),
    getTopProducts: vi.fn(),
    getTopClients: vi.fn(),
    getAll: vi.fn(),
  },
  produitService: {
    getStockByCategory: vi.fn(),
    getAll: vi.fn(),
  },
  commandeService: {
    getStats: vi.fn(),
  },
  paiementService: {
    getStats: vi.fn(),
  },
  reportService: {
    getAlerts: vi.fn(),
    getRevenueForecast: vi.fn(),
    getYoYComparison: vi.fn(),
  },
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, className }: any) => (
    <a href={to} className={className} data-testid="link">{children}</a>
  ),
  useNavigate: () => () => {},
}));

vi.mock('recharts', () => ({
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => null,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Legend: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  Cell: () => null,
}));

// Role-gated widget pulls in AuthContext; stub it out for this page-level test.
vi.mock('../components/DashboardDemandeWidgets', () => ({
  DashboardDemandeWidgets: () => null,
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { factureService, produitService, commandeService, paiementService, reportService } from '../services/api';

const mockStats = {
  total_factures: { count: '150', montant: '7500000' },
  factures_mois: { count: '25', montant: '1250000' },
  alertes_stock: 3,
};
const mockCommandeStats = { en_attente: '5', validee: '3', expediee: '2', livree: '10' };

function primeHappyPath() {
  (factureService.getStats as any).mockResolvedValue(mockStats);
  (factureService.getRevenueTrends as any).mockResolvedValue([]);
  (factureService.getTopProducts as any).mockResolvedValue([]);
  (factureService.getTopClients as any).mockResolvedValue([]);
  (produitService.getStockByCategory as any).mockResolvedValue([]);
  (factureService.getAll as any).mockResolvedValue({ data: [] });
  (produitService.getAll as any).mockResolvedValue({ data: [] });
  (commandeService.getStats as any).mockResolvedValue(mockCommandeStats);
  (paiementService.getStats as any).mockResolvedValue(null);
  (reportService.getAlerts as any).mockResolvedValue(null);
  (reportService.getRevenueForecast as any).mockResolvedValue(null);
  (reportService.getYoYComparison as any).mockResolvedValue(null);
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeHappyPath();
  });

  it('shows a loading state initially', () => {
    render(<Dashboard />);
    expect(screen.getByText(/Chargement/i)).toBeInTheDocument();
  });

  it('renders the dashboard heading after loading', async () => {
    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText('Tableau de Bord')).toBeInTheDocument();
    });
  });

  it('calls all dashboard data endpoints on mount', async () => {
    render(<Dashboard />);
    await waitFor(() => {
      expect(factureService.getStats).toHaveBeenCalled();
      expect(factureService.getRevenueTrends).toHaveBeenCalled();
      expect(factureService.getTopProducts).toHaveBeenCalled();
      expect(factureService.getTopClients).toHaveBeenCalled();
      expect(produitService.getStockByCategory).toHaveBeenCalled();
      expect(commandeService.getStats).toHaveBeenCalled();
    });
  });

  it('renders without crashing when all data sources are empty', async () => {
    (factureService.getStats as any).mockResolvedValue({
      total_factures: { count: '0', montant: '0' },
      factures_mois: { count: '0', montant: '0' },
      alertes_stock: 0,
    });
    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText('Tableau de Bord')).toBeInTheDocument();
    });
  });
});
