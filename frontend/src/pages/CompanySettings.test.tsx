import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CompanySettings from './CompanySettings';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { companySettingsService } from '../services/api';
import { toast } from 'sonner';

vi.mock('../services/api', () => ({
  companySettingsService: {
    get: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const SETTINGS = {
  id: 1,
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
  logo_url: 'data:image/png;base64,iVBORw0KGgo=',
  taux_conversion: 1,
  modules_desactives: [],
  type_activite: 'general' as const,
  ticket_message: null,
};

function renderPage() {
  return render(
    <ConfirmProvider>
      <CompanySettings />
    </ConfirmProvider>
  );
}

describe('CompanySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(companySettingsService.get).mockResolvedValue({ ...SETTINGS });
    vi.mocked(companySettingsService.update).mockImplementation(async (s) => ({ ...SETTINGS, ...s }));
  });

  it('renders the company identity fields', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('Hitek-CI')).toBeInTheDocument());
    expect(screen.getByDisplayValue('Abidjan')).toBeInTheDocument();
    expect(screen.getByDisplayValue('123456')).toBeInTheDocument();
    expect(screen.getByLabelText('RCCM')).toHaveValue('789012');
    expect(screen.getByLabelText('Adresse e-mail')).toHaveValue('test@test.com');
  });

  it('no longer offers a conversion rate that nothing uses, and explains the currency label', async () => {
    renderPage();
    await screen.findByDisplayValue('Hitek-CI');
    expect(screen.queryByLabelText(/Taux de conversion/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Devise/)).toHaveAccessibleDescription(
      'Libellé imprimé après les montants sur vos documents. Utilisez «\u00A0FCFA\u00A0».'
    );
  });

  it('shows unsaved changes and saves from the always-visible bar', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByDisplayValue('Hitek-CI');
    expect(screen.getByText('Tous les paramètres sont enregistrés')).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Nom de l’entreprise/));
    await user.type(screen.getByLabelText(/Nom de l’entreprise/), 'Hitek Plateau');
    expect(screen.getByText('Modifications non enregistrées')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Enregistrer les paramètres' }));
    await waitFor(() =>
      expect(companySettingsService.update).toHaveBeenCalledWith(expect.objectContaining({ nom: 'Hitek Plateau' }))
    );
    expect(toast.success).toHaveBeenCalledWith('Paramètres de l’entreprise enregistrés');
    expect(screen.getByText('Tous les paramètres sont enregistrés')).toBeInTheDocument();
  }, 20_000);

  it('choisit le profil métier, applique ses modules et enregistre le message du ticket', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByDisplayValue('Hitek-CI');

    await user.click(screen.getByRole('radio', { name: /Habillement et mode/ }));
    await user.click(screen.getByRole('button', { name: 'Appliquer les modules du profil' }));
    expect(screen.getByRole('checkbox', { name: /^Devis/ })).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Appliquer les modules du profil' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Message du ticket de caisse'), 'Merci de votre visite');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les paramètres' }));

    await waitFor(() => expect(companySettingsService.update).toHaveBeenCalled());
    expect(vi.mocked(companySettingsService.update).mock.calls[0][0]).toMatchObject({
      type_activite: 'habillement',
      modules_desactives: ['devis', 'bons-livraison', 'relances'],
      ticket_message: 'Merci de votre visite',
    });
  });

  it('refuses an empty company name without calling the server', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByDisplayValue('Hitek-CI');
    await user.clear(screen.getByLabelText(/Nom de l’entreprise/));
    await user.click(screen.getByRole('button', { name: 'Enregistrer les paramètres' }));
    expect(await screen.findByText('Saisissez le nom de l’entreprise.')).toBeInTheDocument();
    expect(companySettingsService.update).not.toHaveBeenCalled();
  });

  it('asks before removing the logo, with a visible button (not a hover overlay)', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByDisplayValue('Hitek-CI');
    expect(screen.getByRole('img', { name: 'Aperçu du logo' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retirer le logo' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Retirer le logo' }));

    await waitFor(() => expect(screen.queryByRole('img', { name: 'Aperçu du logo' })).not.toBeInTheDocument());
    expect(screen.getByText('Aucun logo')).toBeInTheDocument();
    expect(screen.getByText('Modifications non enregistrées')).toBeInTheDocument();
  }, 20_000);
});
