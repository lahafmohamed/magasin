import { describe, it, expect, beforeAll } from 'vitest';
import { companySettingsService } from './CompanySettingsService';
import pool from '../db/connection';

describe('CompanySettingsService', () => {
  beforeAll(async () => {
    await pool.query('DELETE FROM company_settings WHERE id = 1');
  });

  it('getSettings() should create table if absent and return defaults', async () => {
    const settings = await companySettingsService.getSettings();
    expect(settings).toBeDefined();
    expect(settings.id).toBe(1);
    expect(settings.nom).toBe('Hitek-CI');
    expect(settings.devise).toBe('FCFA');
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
});
