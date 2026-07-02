import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import GeneralLedger from '../GeneralLedger';

vi.mock('../../services/api', () => ({
  generalLedgerService: {
    getAll: vi.fn().mockResolvedValue({ data: [] }),
    getChartOfAccounts: vi.fn().mockResolvedValue({ data: [] }),
    getTrialBalance: vi.fn().mockResolvedValue({ data: [] }),
    exportAll: vi.fn(),
    exportPdf: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('GeneralLedger', () => {
  it('should render CSV export button after loading', async () => {
    render(<GeneralLedger />);
    expect(await screen.findByText('Exporter en CSV')).toBeInTheDocument();
  });

  it('should render PDF export button after loading', async () => {
    render(<GeneralLedger />);
    expect(await screen.findByText('Exporter en PDF')).toBeInTheDocument();
  });
});
