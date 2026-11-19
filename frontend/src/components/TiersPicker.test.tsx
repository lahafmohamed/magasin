import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TiersPicker, type TiersPickerValue } from './TiersPicker';
import type { Tiers } from '../types';

vi.mock('../services/api', () => ({
  tiersService: { search: vi.fn(), createClient: vi.fn() },
}));

let currentRole: string | null = 'caissier';
vi.mock('../lib/AuthContext', () => ({
  useOptionalAuth: () =>
    currentRole === null
      ? undefined
      : { user: { id: 1, role: currentRole }, hasRole: (...roles: string[]) => roles.includes(currentRole as string) },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { tiersService } from '../services/api';
import { toast } from 'sonner';

const mocked = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const kone = {
  id: 4,
  code: 'CLI-0004',
  raison_sociale: 'KONÉ',
  prenom: 'Awa',
  telephone: '0102030405',
  email: null,
  est_client: true,
  est_fournisseur: false,
};

function Harness({
  role = 'client',
  onChange = vi.fn(),
}: {
  role?: 'client' | 'fournisseur';
  onChange?: (t: Tiers | null) => void;
}) {
  const [value, setValue] = useState<TiersPickerValue | null>(null);
  return (
    <>
      <span id="titre">Client</span>
      <TiersPicker
        id="picker"
        role={role}
        value={value}
        aria-labelledby="titre"
        onChange={(t) => {
          setValue(t);
          onChange(t);
        }}
      />
    </>
  );
}

describe('TiersPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentRole = 'caissier';
    mocked(tiersService.search).mockImplementation(async (q: string) => (/kon/i.test(q) ? [kone] : []));
  });

  it('combobox ARIA : flèches, option active annoncée, Entrée choisit, focus sur « Changer de client »', async () => {
    const user = userEvent.setup({ delay: null });
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: 'Client' });
    await user.type(input, 'kon');
    const option = await screen.findByRole('option', { name: /KONÉ Awa/ });
    expect(await screen.findByRole('status')).toHaveTextContent('1 client trouvé');

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', option.id);
    // Option active visible au clavier : anneau `ring` (GV-01), pas un fond seul.
    expect(option).toHaveClass('ring-2', 'ring-inset', 'ring-ring');
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith(kone);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Changer de client' })).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Changer de client' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Client' })).toHaveFocus());
  });

  it('D4 : « Créer le client » ouvre la création rapide, préremplie, et choisit le client créé', async () => {
    const user = userEvent.setup({ delay: null });
    const onChange = vi.fn();
    const created = { ...kone, id: 99, code: 'CLI-0099', raison_sociale: 'Kouakou', prenom: null, telephone: '0707070707' };
    mocked(tiersService.createClient).mockResolvedValue(created);
    render(<Harness onChange={onChange} />);

    await user.type(screen.getByRole('combobox', { name: 'Client' }), 'Kouakou');
    expect(await screen.findByText('Aucun client ne correspond à « Kouakou ».')).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Créer le client « Kouakou »' }));

    const dialog = await screen.findByRole('dialog', { name: 'Nouveau client' });
    expect(within(dialog).getByLabelText(/Nom ou raison sociale/)).toHaveValue('Kouakou');
    await user.type(within(dialog).getByLabelText('Téléphone'), '0707070707');
    await user.click(within(dialog).getByRole('button', { name: 'Créer le client' }));

    await waitFor(() =>
      expect(tiersService.createClient).toHaveBeenCalledWith({
        raison_sociale: 'Kouakou',
        prenom: undefined,
        telephone: '0707070707',
        email: undefined,
        adresse: undefined,
      })
    );
    expect(onChange).toHaveBeenCalledWith(created);
    expect(toast.success).toHaveBeenCalledWith('Client Kouakou créé');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('D4 : les messages de validation du serveur s’affichent sous le champ concerné', async () => {
    const user = userEvent.setup({ delay: null });
    mocked(tiersService.createClient).mockRejectedValue({
      response: {
        status: 400,
        data: { success: false, error: 'Données invalides', details: [{ field: 'email', message: 'Adresse e-mail invalide.' }] },
      },
    });
    render(<Harness />);
    await user.type(screen.getByRole('combobox', { name: 'Client' }), 'Diallo');
    await user.click(await screen.findByRole('option', { name: 'Créer le client « Diallo »' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouveau client' });
    await user.type(within(dialog).getByLabelText('Adresse e-mail'), 'diallo@exemple.ci');
    await user.click(within(dialog).getByRole('button', { name: 'Créer le client' }));

    const email = within(dialog).getByLabelText('Adresse e-mail');
    expect(await within(dialog).findByText('Adresse e-mail invalide.')).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(email).toHaveFocus());
  });

  it('D4 : nom obligatoire, vérifié avant tout envoi', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await user.type(screen.getByRole('combobox', { name: 'Client' }), 'x');
    await user.click(await screen.findByRole('option', { name: 'Créer le client « x »' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouveau client' });
    await user.clear(within(dialog).getByLabelText(/Nom ou raison sociale/));
    await user.click(within(dialog).getByRole('button', { name: 'Créer le client' }));
    expect(await within(dialog).findByText('Saisissez le nom ou la raison sociale.')).toBeInTheDocument();
    expect(tiersService.createClient).not.toHaveBeenCalled();
  });

  it('pas de création pour un fournisseur, ni pour un rôle non autorisé', async () => {
    const user = userEvent.setup({ delay: null });
    const { unmount } = render(<Harness role="fournisseur" />);
    await user.type(screen.getByRole('combobox', { name: 'Client' }), 'zzz');
    expect(await screen.findByText('Aucun fournisseur ne correspond à « zzz ».')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Créer/ })).not.toBeInTheDocument();
    unmount();

    currentRole = 'depot_staff';
    render(<Harness />);
    await user.type(screen.getByRole('combobox', { name: 'Client' }), 'zzz');
    expect(await screen.findByText('Aucun client ne correspond à « zzz ».')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Créer/ })).not.toBeInTheDocument();
  });

  it('une recherche en échec le dit, au lieu d’afficher « aucun résultat »', async () => {
    const user = userEvent.setup({ delay: null });
    mocked(tiersService.search).mockRejectedValue({ response: { status: 500, data: { error: 'Erreur serveur' } } });
    render(<Harness />);
    await user.type(screen.getByRole('combobox', { name: 'Client' }), 'kon');
    // Texte visible dans la liste + annonce de la région vivante.
    expect(await screen.findAllByText('La recherche a échoué. Réessayez.')).toHaveLength(2);
    expect(screen.queryByText(/Aucun client/)).not.toBeInTheDocument();
  });
});
