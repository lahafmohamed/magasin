import pool from '../db/connection';
import { logger } from '../utils/logger';
import { AuditService } from './AuditService';

export interface CompanySettings {
  id: number;
  nom: string;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  site_web: string | null;
  nif: string | null;
  rc: string | null;
  ai: string | null;
  cb: string | null;
  devise: string;
  logo_url: string | null;
  taux_conversion: number;
  /**
   * Clés des modules masqués dans l'interface (liste d'EXCLUSION : un module
   * absent de cette liste est actif). Voir migration 098.
   */
  modules_desactives: string[];
}

export class CompanySettingsService {
  private cachedSettings: CompanySettings | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 60_000; // 60 seconds

  /**
   * Helper to ensure the company_settings table exists and is populated.
   * Runs dynamically so no manual database migrations are required for the application to work.
   */
  private async ensureTable(): Promise<void> {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS company_settings (
          id INTEGER PRIMARY KEY DEFAULT 1,
          nom VARCHAR(100) NOT NULL DEFAULT 'Hitek-CI',
          adresse TEXT DEFAULT 'Abidjan, Côte d''Ivoire',
          telephone VARCHAR(50) DEFAULT '+225 07 00 00 00',
          email VARCHAR(100) DEFAULT 'contact@hitek-ci.com',
          site_web VARCHAR(100) DEFAULT 'www.hitek-ci.com',
          nif VARCHAR(50) DEFAULT '',
          rc VARCHAR(50) DEFAULT '',
          ai VARCHAR(50) DEFAULT '',
          cb VARCHAR(100) DEFAULT '',
          devise VARCHAR(10) DEFAULT 'FCFA',
          logo_url TEXT DEFAULT '/logo.png',
          taux_conversion NUMERIC(10,4) DEFAULT 1.0000,
          modules_desactives JSONB NOT NULL DEFAULT '[]'::jsonb,
          CONSTRAINT one_row CHECK (id = 1)
        );
      `);

      // Bases créées avant la 098 : la table existe déjà, seul le CREATE ci-dessus
      // est sauté. Sans cet ALTER, `modules_desactives` resterait absente.
      await pool.query(`
        ALTER TABLE company_settings
          ADD COLUMN IF NOT EXISTS modules_desactives JSONB NOT NULL DEFAULT '[]'::jsonb;
      `);

      await pool.query(`
        INSERT INTO company_settings (id, nom, adresse, telephone, email, devise)
        VALUES (1, 'Hitek-CI', 'Abidjan, Côte d''Ivoire', '+225 07 00 00 00', 'contact@hitek-ci.com', 'FCFA')
        ON CONFLICT (id) DO NOTHING;
      `);
    } catch (error) {
      logger.error({ error }, 'Failed to initialize company_settings table');
    }
  }

  /**
   * Get the global company settings with in-memory cache
   */
  async getSettings(): Promise<CompanySettings> {
    const now = Date.now();
    if (this.cachedSettings && (now - this.cacheTimestamp) < this.CACHE_TTL) {
      return this.cachedSettings;
    }
    await this.ensureTable();
    const { rows } = await pool.query('SELECT * FROM company_settings WHERE id = 1');
    this.cachedSettings = rows[0];
    this.cacheTimestamp = now;
    return rows[0];
  }

  /**
   * Update company settings
   */
  async updateSettings(settings: Partial<CompanySettings>): Promise<CompanySettings> {
    await this.ensureTable();
    const oldSettings = this.cachedSettings || await this.getSettings();

    const {
      nom = oldSettings.nom || 'Hitek-CI',
      adresse = oldSettings.adresse ?? '',
      telephone = oldSettings.telephone ?? '',
      email = oldSettings.email ?? '',
      site_web = oldSettings.site_web ?? '',
      nif = oldSettings.nif ?? '',
      rc = oldSettings.rc ?? '',
      ai = oldSettings.ai ?? '',
      cb = oldSettings.cb ?? '',
      devise = oldSettings.devise || 'FCFA',
      logo_url = oldSettings.logo_url ?? '/logo.png',
      taux_conversion = oldSettings.taux_conversion ?? 1,
      modules_desactives = oldSettings.modules_desactives ?? []
    } = settings;

    // Dédoublonnage : la liste sert de test d'appartenance, un doublon n'a pas
    // de sens et gonflerait le JSON à chaque enregistrement.
    const modules = [...new Set((modules_desactives ?? []).map((m) => String(m)))];

    const { rows } = await pool.query(
      `UPDATE company_settings
       SET nom = $1, adresse = $2, telephone = $3, email = $4, site_web = $5,
           nif = $6, rc = $7, ai = $8, cb = $9, devise = $10, logo_url = $11,
           taux_conversion = $12, modules_desactives = $13::jsonb
       WHERE id = 1
       RETURNING *`,
      [nom, adresse, telephone, email, site_web, nif, rc, ai, cb, devise, logo_url, taux_conversion, JSON.stringify(modules)]
    );

    this.cachedSettings = rows[0];
    this.cacheTimestamp = Date.now();

    AuditService.log('company_settings', 1, 'UPDATE', oldSettings, rows[0]);

    return rows[0];
  }
}

export const companySettingsService = new CompanySettingsService();
