import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { companySettingsService, MODULES_HORS_V1 } from './CompanySettingsService';
import pool from '../db/connection';

/**
 * Périmètre v1 : la même liste vit à trois endroits (le backend ne peut pas
 * importer le frontend, et le SQL de référence est du SQL). Ces tests les
 * tiennent alignés — une clé ajoutée d'un seul côté ferait apparaître, ou
 * disparaître, un module sans que personne l'ait décidé.
 */
describe('périmètre v1 — modules masqués sur une instance neuve', () => {
  const attendu = [...MODULES_HORS_V1].sort();

  it('ci-ref-data.sql sème exactement la liste du backend', () => {
    const sql = readFileSync(path.resolve(__dirname, '../db/ci-ref-data.sql'), 'utf8');
    const match = sql.match(/INSERT INTO public\.company_settings \(id, modules_desactives\) VALUES\s*\(1, '(\[[^\]]*\])'::jsonb\)/);
    expect(match, 'ligne company_settings absente de ci-ref-data.sql').not.toBeNull();
    expect((JSON.parse(match![1]) as string[]).sort()).toEqual(attendu);
  });

  it('le catalogue du frontend déclare la même liste', () => {
    const ts = readFileSync(path.resolve(__dirname, '../../../frontend/src/config/modules.ts'), 'utf8');
    const match = ts.match(/export const MODULES_HORS_V1 = \[([^\]]*)\] as const/);
    expect(match, 'MODULES_HORS_V1 absent de frontend/src/config/modules.ts').not.toBeNull();
    const cles = match![1].split(',').map((k) => k.trim().replace(/['"]/g, '')).filter(Boolean);
    expect(cles.sort()).toEqual(attendu);
  });

  it('respecte le format de clé accepté par l’API', () => {
    for (const cle of MODULES_HORS_V1) expect(cle).toMatch(/^[a-z0-9-]{1,50}$/);
  });
});

describe('CompanySettingsService', () => {
  beforeAll(async () => {
    await pool.query('DELETE FROM company_settings WHERE id = 1');
  });

  it('getSettings() should create table if absent and return defaults', async () => {
    const settings = await companySettingsService.getSettings();
    expect(settings).toBeDefined();
    expect(settings.id).toBe(1);
    expect(settings.nom).toBe('Mon entreprise');
    expect(settings.devise).toBe('FCFA');
    // Une ligne créée à la volée démarre elle aussi dans le périmètre v1.
    expect([...settings.modules_desactives].sort()).toEqual([...MODULES_HORS_V1].sort());
  });

  it('updateSettings() should modify and return new values', async () => {
    const updated = await companySettingsService.updateSettings({
      nom: 'Test Corp',
      devise: 'EUR',
      nif: '123456789',
    });
    expect(updated.nom).toBe('Test Corp');
    expect(updated.devise).toBe('EUR');
    expect(updated.nif).toBe('123456789');

    const fetched = await companySettingsService.getSettings();
    expect(fetched.nom).toBe('Test Corp');
    expect(fetched.devise).toBe('EUR');
    expect(fetched.nif).toBe('123456789');
  });

  it('updateSettings() should keep defaults for omitted fields', async () => {
    await companySettingsService.updateSettings({ nom: 'Partial Update' });
    const settings = await companySettingsService.getSettings();
    expect(settings.nom).toBe('Partial Update');
    expect(settings.devise).toBe('EUR');
  });

  it('un enregistrement sans la liste des modules ne ré-expose rien', async () => {
    await companySettingsService.updateSettings({ nom: 'Sans modules' });
    const settings = await companySettingsService.getSettings();
    expect([...settings.modules_desactives].sort()).toEqual([...MODULES_HORS_V1].sort());
  });

  it('une ligne existante n’est jamais ramenée au périmètre v1 de force', async () => {
    // Option activée pour ce client : la paie sort de la liste et y reste.
    await companySettingsService.updateSettings({ modules_desactives: ['employes', 'comptabilite', 'tresorerie'] });
    await companySettingsService.updateSettings({ nom: 'Client avec la paie' });
    // Lu en base, pas dans le cache du service.
    const { rows } = await pool.query('SELECT modules_desactives FROM company_settings WHERE id = 1');
    expect([...rows[0].modules_desactives].sort()).toEqual(['comptabilite', 'employes', 'tresorerie']);
  });
});
