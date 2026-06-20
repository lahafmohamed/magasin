import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CompanySettings from './CompanySettings';

vi.mock('../services/api', () => ({
  companySettingsService: {
    get: vi.fn().mockResolvedValue({
      nom: 'Hitek-CI',
      adresse: 'Abidjan',
      telephone: '+225 00 00 00',
      email: 'test@test.com',
      site_web: 'www.test.com',
      nif: '123456',
      rc: '789012',
      ai: '345678',
      cb: '901234',
      devise: 'FCFA',
      logo_url: '/logo.png',
    }),
    update: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('CompanySettings', () => {
  beforeEach(() => {
    render(<CompanySettings />);
  });

  it('should render the form with company settings fields', async () => {
    await waitFor(() => {
      expect(screen.getByDisplayValue('Hitek-CI')).toBeDefined();
    });
    expect(screen.getByDisplayValue('Abidjan')).toBeDefined();
    expect(screen.getByDisplayValue('123456')).toBeDefined();
    expect(screen.getByDisplayValue('FCFA')).toBeDefined();
  });

  it('should submit and show success toast', async () => {
    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Hitek-CI')).toBeDefined();
    });
    const saveButton = screen.getByText('Enregistrer');
    await user.click(saveButton);
    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalled();
  });
});
