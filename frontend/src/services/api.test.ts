import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import {
  api,
  auditService,
  caisseService,
  creditNoteService,
  factureService,
  failedEnvelopeError,
  generalLedgerService,
  normalizeApiResponseBody,
  paiementService,
  reportService,
  retourService,
  tiersService,
} from './api';
import { getErrorMessage, OFFLINE_MESSAGE } from '../utils/errors';

/** Faux serveur : répond `body` avec `status` à toute requête de l'instance `api`. */
function respondWith(status: number, body: unknown, seen?: InternalAxiosRequestConfig[]): AxiosAdapter {
  return async (config) => {
    seen?.push(config);
    const response = { data: body, status, statusText: String(status), headers: {}, config };
    if (status >= 400) {
      const error = Object.assign(new Error(`Request failed with status code ${status}`), {
        isAxiosError: true,
        response,
        config,
      });
      throw error;
    }
    return response;
  };
}

const defaultAdapter = api.defaults.adapter;
afterEach(() => {
  api.defaults.adapter = defaultAdapter;
});

describe('enveloppes des services', () => {
  it('encaissement : renvoie le résultat ET la phrase de confirmation du serveur (D3)', async () => {
    const seen: InternalAxiosRequestConfig[] = [];
    api.defaults.adapter = respondWith(
      201,
      {
        success: true,
        data: {
          facture_id: 110,
          numero_facture: 'FAC-2026-00110',
          montant_recu: 70000,
          applique_depuis_acomptes: 0,
          applications: [],
          direct_montant: 70000,
          reste_du: 30000,
          statut_facture: 'partielle',
        },
        message: 'Paiement de 70 000 FCFA enregistré en espèces. Reste dû : 30 000 FCFA.',
      },
      seen
    );
    const result = await paiementService.create(110, { montant: 70000, methode_paiement: 'espece' });
    expect(result.message).toBe('Paiement de 70 000 FCFA enregistré en espèces. Reste dû : 30 000 FCFA.');
    expect(result.reste_du).toBe(30000);
    expect(result.statut_facture).toBe('partielle');
    // Aucun acompte n'est demandé implicitement.
    expect(JSON.parse(seen[0].data as string)).not.toHaveProperty('appliquer_acomptes');
  });

  it('statistiques des avoirs : dépliées une seule fois (U-31)', async () => {
    api.defaults.adapter = respondWith(200, { success: true, data: { valideCount: 3, valideTotal: 145875 } });
    await expect(creditNoteService.getStats()).resolves.toEqual({ valideCount: 3, valideTotal: 145875 });
  });

  it('client comptoir : `null` quand l’instance n’en a pas', async () => {
    api.defaults.adapter = respondWith(404, { success: false, error: 'Aucun client comptoir n’est configuré.' });
    await expect(tiersService.getComptoir()).resolves.toBeNull();
  });

  it('création de client depuis la vente : jamais un fournisseur', async () => {
    const seen: InternalAxiosRequestConfig[] = [];
    api.defaults.adapter = respondWith(201, { success: true, data: { id: 9, raison_sociale: 'Kouamé' } }, seen);
    await tiersService.createClient({ raison_sociale: 'Kouamé', telephone: '0700000000' });
    expect(JSON.parse(seen[0].data as string)).toMatchObject({ est_client: true, est_fournisseur: false });
  });
});

describe('enveloppes gardées (champs hors de `data`)', () => {
  it('journal d’audit : `total` à la racine', async () => {
    api.defaults.adapter = respondWith(200, { success: true, data: [{ id: 1 }], total: 158 });
    await expect(auditService.getLogs({ page: 2 })).resolves.toEqual({ data: [{ id: 1 }], total: 158 });
  });

  it('export du grand livre : `truncated` signale un export plafonné', async () => {
    api.defaults.adapter = respondWith(200, { success: true, data: [{ id: 1 }], truncated: true });
    await expect(generalLedgerService.exportAll({})).resolves.toEqual({ data: [{ id: 1 }], truncated: true });
  });

  it('export des créances : `truncated` conservé, faux par défaut', async () => {
    api.defaults.adapter = respondWith(200, { success: true, data: [] });
    await expect(reportService.exportReceivables({ bucket: 'all' })).resolves.toEqual({ data: [], truncated: false });
  });

  it('audit caisse : par l’instance commune, `summary` et `orphans_total` gardés', async () => {
    const seen: InternalAxiosRequestConfig[] = [];
    api.defaults.adapter = respondWith(
      200,
      { success: true, data: [{ source_id: 1 }], summary: [{ source_kind: 'paiement' }], orphans_total: 2 },
      seen
    );
    await expect(caisseService.getAudit({ orphans_only: true })).resolves.toEqual({
      data: [{ source_id: 1 }],
      summary: [{ source_kind: 'paiement' }],
      orphans_total: 2,
    });
    expect(seen[0].url).toBe('/caisse/audit');
    expect(seen[0].params).toMatchObject({ orphans_only: 'true' });
  });

  it('retours : le statut demandé part au serveur', async () => {
    const seen: InternalAxiosRequestConfig[] = [];
    api.defaults.adapter = respondWith(200, { success: true, data: [], pagination: { total: 0 } }, seen);
    await retourService.getAll(1, 20, 'en_attente');
    expect(seen[0].url).toContain('statut=en_attente');
  });
});

describe('PDF des documents', () => {
  it('télécharge le PDF serveur de la facture sous son numéro', async () => {
    const seen: InternalAxiosRequestConfig[] = [];
    api.defaults.adapter = respondWith(200, new Blob(['%PDF']), seen);
    const createObjectURL = vi.fn(() => 'blob:facture');
    const revokeObjectURL = vi.fn();
    Object.assign(window.URL, { createObjectURL, revokeObjectURL });
    const clicked: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });

    await factureService.downloadPdf(110, 'FAC-2026-00110');

    expect(seen[0].url).toBe('/factures/110/pdf');
    expect(seen[0].responseType).toBe('blob');
    expect(clicked).toEqual(['facture-FAC-2026-00110.pdf']);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:facture');
    click.mockRestore();
  });
});

describe('normalizeApiResponseBody', () => {
  it('conserve les lignes et la pagination dans un objet page', () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const pagination = { page: 1, limit: 20, total: 9, totalPages: 1 };

    const result = normalizeApiResponseBody({
      success: true,
      data: rows,
      pagination,
    });

    expect(result).toEqual({ data: rows, pagination });
    expect(rows).not.toHaveProperty('pagination');
  });

  it('conserve le `summary` d’une liste paginée (Relances « Total à recouvrer »)', () => {
    const rows = [{ client_id: 1, total_du: '250000' }];
    const pagination = { page: 1, limit: 20, total: 16, totalPages: 1 };
    const summary = { montant_total: 13850765 };

    expect(
      normalizeApiResponseBody({ success: true, data: rows, pagination, summary })
    ).toEqual({ data: rows, pagination, summary });
  });

  it('n’ajoute pas de clé `summary` quand le serveur n’en envoie pas', () => {
    const result = normalizeApiResponseBody({
      success: true,
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    expect(result).not.toHaveProperty('summary');
  });

  it('déplie une réponse non paginée', () => {
    expect(
      normalizeApiResponseBody({
        success: true,
        data: { id: 42, numero: 'CMD-42' },
      })
    ).toEqual({ id: 42, numero: 'CMD-42' });
  });

  it('déplie les statistiques une seule fois (avoirs : plus de double `data.data`)', () => {
    const stats = { valideCount: 3, valideTotal: 145875 };
    expect(normalizeApiResponseBody({ success: true, data: stats })).toEqual(stats);
  });

  it('conserve les réponses historiques sans enveloppe', () => {
    const legacy = [{ id: 1 }];
    expect(normalizeApiResponseBody(legacy)).toBe(legacy);
  });

  it('conserve une réponse message sans champ data', () => {
    const response = { success: true, message: 'Statut mis à jour' };
    expect(normalizeApiResponseBody(response)).toBe(response);
  });
});

describe('enveloppe en échec sous un statut 200 (lot 29-A)', () => {
  /** Ce que répondait l'ancien service worker à une coupure réseau. */
  const OLD_SW_OFFLINE = { success: false, error: 'Hors ligne' };
  const FALLBACK = 'La vente n’a pas été enregistrée. Vérifiez les articles puis réessayez.';

  it('vente comptoir : le faux succès du service worker devient une erreur réseau', async () => {
    api.defaults.adapter = respondWith(200, OLD_SW_OFFLINE);
    const error = await factureService
      .createVenteComptoir({ lignes: [{ produit_id: 5, quantite: 1, prix_unitaire: 2500 }], paiements: [{ methode_paiement: 'espece' }] })
      .catch((err: unknown) => err);
    expect(error).toMatchObject({ isAxiosError: true, code: 'ERR_NETWORK' });
    // « Serveur injoignable », jamais le libellé de la page : la vente a peut-être été écrite.
    expect(getErrorMessage(error, FALLBACK)).toBe(OFFLINE_MESSAGE);
  });

  it('encaissement (`keepEnvelope`) : rejeté aussi', async () => {
    api.defaults.adapter = respondWith(200, OLD_SW_OFFLINE);
    await expect(paiementService.create(110, { montant: 5000, methode_paiement: 'espece' })).rejects.toMatchObject({
      code: 'ERR_NETWORK',
    });
  });

  it('caisse : ouverture et clôture rejetées', async () => {
    api.defaults.adapter = respondWith(200, OLD_SW_OFFLINE);
    await expect(caisseService.ouvrir({ magasin_id: 1, fond_initial: 20000 })).rejects.toMatchObject({ code: 'ERR_NETWORK' });
    await expect(caisseService.cloturer(2, { fond_final_compte: 60000 })).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });

  it('lecture : une liste en échec est une erreur, pas une page vide qui plante', async () => {
    api.defaults.adapter = respondWith(200, OLD_SW_OFFLINE);
    await expect(api.get('/factures')).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });

  it('autre refus en 200 : rejeté avec son message serveur', async () => {
    api.defaults.adapter = respondWith(200, { success: false, error: 'Caisse fermée : ouvrez-la avant d’encaisser.' });
    const error = await api.post('/factures/comptoir', {}).catch((err: unknown) => err);
    expect(getErrorMessage(error, FALLBACK)).toBe('Caisse fermée : ouvrez-la avant d’encaisser.');
  });

  it('une réponse réussie passe toujours', async () => {
    api.defaults.adapter = respondWith(200, { success: true, data: { id: 1 } });
    await expect(api.get('/factures/1')).resolves.toMatchObject({ data: { id: 1 } });
  });

  it('failedEnvelopeError ignore un corps sans enveloppe', () => {
    const config = {} as InternalAxiosRequestConfig;
    expect(failedEnvelopeError({ data: [{ id: 1 }], status: 200, statusText: 'OK', headers: {}, config })).toBeNull();
    expect(failedEnvelopeError({ data: 'texte', status: 200, statusText: 'OK', headers: {}, config })).toBeNull();
  });
});
