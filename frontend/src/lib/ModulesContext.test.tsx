import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { ModulesProvider, useModules } from './ModulesContext';
import { companySettingsService } from '@/services/api';

/**
 * Périmètre v1 : paie, employés, comptabilité et trésorerie ne doivent jamais
 * apparaître « par défaut ». Avant, le contexte partait d'une liste vide et y
 * revenait à la moindre erreur : un lien direct vers /paie ouvrait la page
 * pendant le chargement, et une panne des paramètres rouvrait tout.
 */
vi.mock('@/services/api', () => ({
  companySettingsService: { get: vi.fn() },
}));
const session = vi.hoisted(() => ({ mustChange: false }));
vi.mock('./AuthContext', () => ({
  useOptionalAuth: () => ({ user: { id: 7, role: 'admin', must_change_password: session.mustChange } }),
}));

const V1 = ['paie', 'employes', 'comptabilite', 'tresorerie'];

function Sonde() {
  const { estCheminActif, estModuleActif, chargement, rafraichir } = useModules();
  return (
    <div>
      <output aria-label="chargement">{String(chargement)}</output>
      <output aria-label="paie">{String(estCheminActif('/paie'))}</output>
      <output aria-label="comptabilite">{String(estCheminActif('/general-ledger'))}</output>
      <output aria-label="tresorerie">{String(estModuleActif('tresorerie'))}</output>
      <output aria-label="devis">{String(estCheminActif('/devis'))}</output>
      <output aria-label="factures">{String(estCheminActif('/factures'))}</output>
      <button type="button" onClick={() => void rafraichir()}>
        Rafraîchir
      </button>
    </div>
  );
}

const valeur = (nom: string) => screen.getByLabelText(nom).textContent;

function monter() {
  return render(
    <ModulesProvider>
      <Sonde />
    </ModulesProvider>
  );
}

describe('ModulesProvider — périmètre v1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.mustChange = false;
  });

  it('pendant un changement de mot de passe dû : aucune requête, rien en attente', async () => {
    // Le jeton n'ouvre que le changement de mot de passe : la requête répondrait 403.
    session.mustChange = true;
    monter();
    await waitFor(() => expect(valeur('chargement')).toBe('false'));
    expect(companySettingsService.get).not.toHaveBeenCalled();
    expect(valeur('paie')).toBe('false');
  });

  it('tant que les paramètres ne sont pas arrivés : en chargement, hors-v1 masqué', async () => {
    let repondre: (v: unknown) => void = () => {};
    vi.mocked(companySettingsService.get).mockReturnValue(new Promise((r) => (repondre = r)) as never);
    monter();

    expect(valeur('chargement')).toBe('true');
    expect(valeur('paie')).toBe('false');
    expect(valeur('comptabilite')).toBe('false');
    expect(valeur('tresorerie')).toBe('false');

    await act(async () => repondre({ modules_desactives: V1, type_activite: 'general' }));
    await waitFor(() => expect(valeur('chargement')).toBe('false'));
    expect(valeur('paie')).toBe('false');
    expect(valeur('devis')).toBe('true');
    expect(valeur('factures')).toBe('true');
  });

  it('une instance où l’éditeur a activé la paie l’affiche une fois chargée', async () => {
    vi.mocked(companySettingsService.get).mockResolvedValue({
      modules_desactives: ['employes', 'comptabilite', 'tresorerie'],
      type_activite: 'general',
    } as never);
    monter();
    await waitFor(() => expect(valeur('chargement')).toBe('false'));
    expect(valeur('paie')).toBe('true');
    expect(valeur('comptabilite')).toBe('false');
  });

  it('si les paramètres ne se chargent pas : le hors-v1 reste masqué, le reste s’ouvre', async () => {
    vi.mocked(companySettingsService.get).mockRejectedValue(new Error('réseau'));
    monter();
    await waitFor(() => expect(valeur('chargement')).toBe('false'));
    expect(valeur('paie')).toBe('false');
    expect(valeur('comptabilite')).toBe('false');
    expect(valeur('tresorerie')).toBe('false');
    // Un module « au choix du client » n'est pas amputé par une panne.
    expect(valeur('devis')).toBe('true');
    expect(valeur('factures')).toBe('true');
  });

  it('une panne après un chargement réussi garde l’option déjà activée', async () => {
    vi.mocked(companySettingsService.get).mockResolvedValueOnce({
      modules_desactives: ['employes', 'comptabilite', 'tresorerie', 'devis'],
      type_activite: 'general',
    } as never);
    monter();
    await waitFor(() => expect(valeur('chargement')).toBe('false'));
    expect(valeur('paie')).toBe('true');
    expect(valeur('devis')).toBe('false');

    vi.mocked(companySettingsService.get).mockRejectedValueOnce(new Error('réseau'));
    await act(async () => screen.getByRole('button', { name: 'Rafraîchir' }).click());
    await waitFor(() => expect(valeur('devis')).toBe('true'));
    // La paie, activée par l'éditeur, ne disparaît pas ; la comptabilité ne s'ouvre pas.
    expect(valeur('paie')).toBe('true');
    expect(valeur('comptabilite')).toBe('false');
    // Un rafraîchissement ne repasse pas en chargement : la page reste montée.
    expect(valeur('chargement')).toBe('false');
  });

  it('un module verrouillé reste actif même si la base contient sa clé', async () => {
    vi.mocked(companySettingsService.get).mockResolvedValue({
      modules_desactives: [...V1, 'factures'],
      type_activite: 'general',
    } as never);
    monter();
    await waitFor(() => expect(valeur('chargement')).toBe('false'));
    expect(valeur('factures')).toBe('true');
  });
});
