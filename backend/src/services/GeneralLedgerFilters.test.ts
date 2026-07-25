import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../server';
import pool from '../db/connection';
import { generalLedgerService } from './GeneralLedgerService';

describe('General ledger findability filters', () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const matchingPiece = `GL-FIND-${suffix}`;
  const otherPiece = `GL-OTHER-${suffix}`;
  let account411Id: number;
  let adminToken: string;
  let today: string;

  beforeAll(async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = login.body.data.token;

    const { rows: accounts } = await pool.query(
      "SELECT id FROM plan_comptable WHERE numero = '411' LIMIT 1"
    );
    account411Id = Number(accounts[0].id);

    const { rows: dates } = await pool.query("SELECT CURRENT_DATE::text AS today");
    today = dates[0].today;

    await pool.query(
      `INSERT INTO ecritures_comptables
         (numero_piece, date_ecriture, journal, compte_numero, libelle, debit, credit, reference_type, reference_id)
       VALUES
         ($1, CURRENT_DATE + TIME '13:30', 'OD', '411', 'Filtre rapprochement Alpha', 1250, 0, 'facture', 987654),
         ($1, CURRENT_DATE + TIME '13:30', 'OD', '701', 'Filtre rapprochement Alpha', 0, 1250, 'facture', 987654),
         ($2, CURRENT_DATE + TIME '14:30', 'OD', '411', 'Autre écriture', 500, 0, NULL, NULL),
         ($2, CURRENT_DATE + TIME '14:30', 'OD', '701', 'Autre écriture', 0, 500, NULL, NULL)`,
      [matchingPiece, otherPiece]
    );
  });

  afterAll(async () => {
    await pool.query(
      'DELETE FROM ecritures_comptables WHERE numero_piece = ANY($1::text[])',
      [[matchingPiece, otherPiece]]
    );
  });

  it('combines account, piece, description, journal, and inclusive date filters', async () => {
    const result = await generalLedgerService.getAll({
      journal: 'OD',
      date_debut: today,
      date_fin: today,
      compte_id: account411Id,
      numero_piece: 'GL-FIND',
      description: 'rapprochement Alpha',
      page: 1,
      limit: 20,
    });

    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({
      numero_piece: matchingPiece,
      compte_numero: '411',
      source_type: 'facture',
      source_id: 987654,
    });
    expect(Number(result.data[0].debit)).toBe(1250);
  });

  it('does not change the balanced debit and credit totals', async () => {
    const result = await generalLedgerService.getAll({
      numero_piece: matchingPiece,
      date_debut: today,
      date_fin: today,
      page: 1,
      limit: 20,
    });

    const debit = result.data.reduce((sum, entry) => sum + Number(entry.debit), 0);
    const credit = result.data.reduce((sum, entry) => sum + Number(entry.credit), 0);
    expect(result.total).toBe(2);
    expect(debit).toBe(1250);
    expect(credit).toBe(1250);
  });

  it('exposes validated combined filters through the API', async () => {
    const response = await request(app)
      .get('/api/general-ledger')
      .query({
        journal: 'OD',
        date_debut: today,
        date_fin: today,
        compte_id: account411Id,
        numero_piece: 'GL-FIND',
        description: 'Alpha',
        page: 1,
        limit: 20,
      })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.pagination.total).toBe(1);
    expect(response.body.data[0].numero_piece).toBe(matchingPiece);

    const invalid = await request(app)
      .get('/api/general-ledger')
      .query({ compte_id: -1 })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe('Paramètres de requête invalides');
  });
});
