import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ParametresFinance from '../ParametresFinance';

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

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { factureFournisseurService, payrollService } from '@/services/api';

const renderPage = () =>
  render(
    <MemoryRouter>
      <ParametresFinance />
    </MemoryRouter>
  );

describe('ParametresFinance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (factureFournisseurService.getMatchConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      qte_tolerance_pct: 0,
      prix_tolerance_pct: 0.05,
      bloquer: false,
    });
  });

  it('explains what an empty contribution list means and offers to add one', async () => {
    (payrollService.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({ cotisations: [], baremes: [] });
    renderPage();

    expect(await screen.findByText('Aucune cotisation configurée')).toBeInTheDocument();
    expect(screen.getByText(/calculés sans retenue sociale/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Ajouter une cotisation/ }).length).toBeGreaterThan(0);
  });

  it('creates a contribution from rates typed in percent and sends fractions', async () => {
    (payrollService.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({ cotisations: [], baremes: [] });
    (payrollService.createCotisation as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 2 });
    renderPage();

    fireEvent.click((await screen.findAllByRole('button', { name: /Ajouter une cotisation/ }))[0]);
    fireEvent.change(await screen.findByLabelText(/^Code/), { target: { value: 'cnps maladie' } });
    fireEvent.change(screen.getByLabelText(/^Libellé/), { target: { value: 'CNPS Maladie' } });
    fireEvent.change(screen.getByLabelText(/^Taux salarial/), { target: { value: '6,3' } });
    fireEvent.change(screen.getByLabelText(/^Taux patronal/), { target: { value: '7.7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la cotisation' }));

    await waitFor(() => expect(payrollService.createCotisation).toHaveBeenCalledTimes(1));
    const payload = (payrollService.createCotisation as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.code).toBe('CNPS_MALADIE');
    expect(payload.libelle).toBe('CNPS Maladie');
    expect(payload.taux_salarial).toBeCloseTo(0.063, 6);
    expect(payload.taux_patronal).toBeCloseTo(0.077, 6);
    expect(payload.plafond).toBeNull();
  });

  it('refuses a rate above 100 % with a message tied to the field', async () => {
    (payrollService.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({ cotisations: [], baremes: [] });
    renderPage();

    fireEvent.click((await screen.findAllByRole('button', { name: /Ajouter une cotisation/ }))[0]);
    fireEvent.change(await screen.findByLabelText(/^Code/), { target: { value: 'ITS' } });
    fireEvent.change(screen.getByLabelText(/^Libellé/), { target: { value: 'Impôt' } });
    fireEvent.change(screen.getByLabelText(/^Taux salarial/), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText(/^Taux patronal/), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la cotisation' }));

    const field = screen.getByLabelText(/^Taux salarial/);
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    expect(field.getAttribute('aria-describedby')).toBe('cot-tauxSalarial-error');
    expect(payrollService.createCotisation).not.toHaveBeenCalled();
  });

  it('labels every rate input of an existing contribution', async () => {
    (payrollService.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      cotisations: [
        { id: 1, code: 'CNPS_RET', libelle: 'CNPS Retraite', taux_salarial: '0.0630', taux_patronal: '0.0770', plafond: '1647315.00', actif: true },
      ],
      baremes: [{ id: 1, tranche_min: '0.00', tranche_max: '75000.00', taux: '0.0000' }],
    });
    renderPage();

    const salarial = await screen.findAllByLabelText('Taux salarial (%) — CNPS Retraite');
    expect((salarial[0] as HTMLInputElement).value).toBe('6,3');
    // Plafond « 1647315.00 » : jamais lu comme 164 731 500 par le champ montant.
    const plafond = screen.getAllByLabelText('Plafond mensuel — CNPS Retraite')[0] as HTMLInputElement;
    expect(plafond.value.replace(/\D/g, '')).toBe('1647315');
    const fin = screen.getByLabelText('Fin de la tranche 1') as HTMLInputElement;
    expect(fin.value.replace(/\D/g, '')).toBe('75000');
  });
});
