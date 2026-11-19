import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuditLog from './AuditLog';
import { auditService } from '../services/api';

vi.mock('../services/api', () => ({
  auditService: { getLogs: vi.fn() },
}));

const ROWS = [
  {
    id: 100,
    action: 'create',
    table_name: 'depenses',
    record_id: 9,
    old_values: null,
    new_values: { montant: 9000, numero_depense: 'DEP-2026-00009' },
    created_at: '2026-10-23T13:14:58.121Z',
    user_id: 3,
    user_nom: 'a.yao',
  },
  {
    id: 99,
    action: 'UPDATE',
    table_name: 'company_settings',
    record_id: 1,
    old_values: { nom: 'Hitek-CI', devise: 'FCFA' },
    new_values: { nom: 'Hitek Plateau', devise: 'FCFA' },
    created_at: '2026-10-23T12:00:00.000Z',
    user_id: 1,
    user_nom: 'admin',
  },
  {
    id: 98,
    action: 'login',
    table_name: 'utilisateurs',
    record_id: 1,
    old_values: null,
    new_values: null,
    created_at: '2026-10-23T11:00:00.000Z',
    user_id: 1,
    user_nom: 'admin',
  },
];

describe('AuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // `total` vient de la racine de l'enveloppe (gardée par `auditService.getLogs`).
    vi.mocked(auditService.getLogs).mockResolvedValue({ data: ROWS, total: 158 });
  });

  it('shows the entries and their real total instead of an empty journal', async () => {
    render(<AuditLog />);
    expect(await screen.findByText('158 événements enregistrés')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Activité enregistrée' });
    expect(within(table).getByRole('cell', { name: /^Dépense n°\s9$/ })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: /^Paramètres de l’entreprise n°\s1$/ })).toBeInTheDocument();
    expect(within(table).getByText('Création')).toBeInTheDocument();
    expect(within(table).getByText('Modification')).toBeInTheDocument();
    expect(within(table).getByText('Connexion')).toBeInTheDocument();
    expect(within(table).queryByText('UPDATE')).not.toBeInTheDocument();
    expect(auditService.getLogs).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
  });

  it('names the element and its number in one cell, the number in mono, without a « N° » column', async () => {
    render(<AuditLog />);
    const table = await screen.findByRole('table', { name: 'Activité enregistrée' });
    expect(within(table).queryByRole('columnheader', { name: 'N°' })).not.toBeInTheDocument();

    const cell = within(table).getByRole('cell', { name: /^Utilisateur n°\s1$/ });
    const numero = within(cell).getByText('1');
    expect(numero.className).toContain('font-mono');
    // « n° » et le numéro ne se séparent jamais.
    expect(cell.textContent).toContain('n°\u00A01');
  });

  it('opens a field-by-field diff that lists only what changed', async () => {
    const user = userEvent.setup();
    render(<AuditLog />);
    const table = await screen.findByRole('table', { name: 'Activité enregistrée' });
    await user.click(within(table).getByRole('button', { name: /paramètres de l’entreprise n° 1/ }));

    const diff = await screen.findByRole('table', { name: 'Valeurs avant et après' });
    expect(within(diff).getByText('nom')).toBeInTheDocument();
    expect(within(diff).getByText('Hitek-CI')).toBeInTheDocument();
    expect(within(diff).getByText('Hitek Plateau')).toBeInTheDocument();
    expect(within(diff).queryByText('devise')).not.toBeInTheDocument();
  }, 20_000);
});
