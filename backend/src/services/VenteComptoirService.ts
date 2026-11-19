import pool from '../db/connection';
import { businessError } from '../utils/errors';
import { logger } from '../utils/logger';
import { formatMontantFcfa } from '../utils/money';
import { PaymentMethod, paymentMethodPhrase } from '../utils/paymentMethods';
import { factureService, type FactureLigneInput } from './FactureService';
import { paiementService } from './PaiementService';
import { roundMoney } from './PricingService';

/** Code du client de passage (migration 104). */
const WALK_IN_CLIENT_CODE = 'PASS';

export interface VenteComptoirPaiementInput {
  methode_paiement: PaymentMethod;
  /** Absent sur un paiement unique : il règle tout le total. */
  montant?: number;
  reference?: string;
}

export interface VenteComptoirInput {
  /** Absent : le « Client comptoir » (code PASS). */
  tiers_id?: number;
  location_id?: number;
  lignes: FactureLigneInput[];
  paiements: VenteComptoirPaiementInput[];
  /** Espèces remises par le client, pour calculer la monnaie à rendre. */
  especes_recues?: number;
  /** Une clé par vente : un double envoi (double clic, scan répété) n'enregistre qu'une vente. */
  idempotency_key?: string;
  notes?: string;
  userId: number | null;
  req?: unknown;
}

export interface VenteComptoirResult {
  /** `true` quand la clé d'idempotence désignait une vente déjà enregistrée. */
  idempotent: boolean;
  facture_id: number;
  numero_facture: string;
  total: number;
  paiements: Array<{ paiement_id: number | null; methode_paiement: PaymentMethod; montant: number }>;
  especes_recues: number | null;
  monnaie_rendue: number;
  message: string;
}

const EPSILON = 0.005;

/**
 * Vente au comptoir : facture + encaissement en UNE transaction. Pas de
 * nouveau moteur — le stock, la caisse, le grand livre, les commissions et
 * les soldes clients passent par `FactureService` et `PaiementService` (et
 * leurs triggers), exactement comme une facture suivie d'un paiement. La
 * différence : rien n'est enregistré si l'encaissement échoue (caisse fermée,
 * montant faux), donc pas de facture impayée oubliée au comptoir.
 */
export class VenteComptoirService {
  async create(input: VenteComptoirInput): Promise<VenteComptoirResult> {
    const { lignes, paiements, especes_recues, idempotency_key, userId } = input;

    if (!Array.isArray(lignes) || lignes.length === 0) {
      throw businessError(422, 'Ajoutez au moins un article avant d’encaisser.');
    }
    if (!Array.isArray(paiements) || paiements.length === 0) {
      throw businessError(422, 'Choisissez un mode de paiement.');
    }
    if (paiements.length > 1 && paiements.some((p) => p.montant === undefined)) {
      throw businessError(422, 'Avec plusieurs modes de paiement, indiquez le montant de chacun.');
    }

    // Vente déjà enregistrée sous cette clé : on la renvoie telle quelle.
    if (idempotency_key) {
      const existing = await this.findByIdempotencyKey(idempotency_key);
      if (existing) return existing;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const tiersId = input.tiers_id ?? (await this.walkInClientId(client));

      const facture = await factureService.createInTransaction(
        client,
        {
          tiers_id: tiersId,
          lignes,
          location_id: input.location_id,
          notes: input.notes,
          cree_par: userId ?? undefined,
          req: input.req,
        },
        { paiementImmediat: true }
      );
      const total = roundMoney(facture.result.total);

      // Montants : un paiement unique sans montant règle le total.
      const montants = paiements.map((p) => roundMoney(p.montant ?? total));
      const somme = roundMoney(montants.reduce((acc, m) => acc + m, 0));
      if (Math.abs(somme - total) > EPSILON) {
        throw businessError(
          422,
          `Le paiement (${formatMontantFcfa(somme)}) ne correspond pas au total de la vente (${formatMontantFcfa(total)}).`
        );
      }
      if (montants.some((m) => m <= 0)) {
        throw businessError(422, 'Chaque mode de paiement doit porter un montant supérieur à 0.');
      }

      // Monnaie à rendre : seulement sur la part payée en espèces.
      const partEspeces = roundMoney(
        paiements.reduce((acc, p, i) => (p.methode_paiement === 'espece' ? acc + montants[i] : acc), 0)
      );
      let monnaieRendue = 0;
      if (especes_recues !== undefined && especes_recues !== null) {
        if (partEspeces <= 0) {
          throw businessError(422, 'Montant reçu en espèces indiqué, mais aucun paiement en espèces.');
        }
        if (especes_recues + EPSILON < partEspeces) {
          throw businessError(
            422,
            `Espèces reçues insuffisantes : ${formatMontantFcfa(especes_recues)} pour ${formatMontantFcfa(partEspeces)} à payer.`
          );
        }
        monnaieRendue = roundMoney(especes_recues - partEspeces);
      }

      const afterCommits: Array<() => void | Promise<void>> = [facture.afterCommit];
      const enregistres: VenteComptoirResult['paiements'] = [];
      for (const [i, p] of paiements.entries()) {
        const { result, afterCommit } = await paiementService.createInTransaction(client, {
          factureId: facture.result.id,
          montant: montants[i],
          methode_paiement: p.methode_paiement,
          reference: p.reference,
          idempotency_key: idempotency_key ? `${idempotency_key}:${i + 1}` : undefined,
          userId,
        });
        afterCommits.push(afterCommit);
        enregistres.push({
          paiement_id: result.direct_paiement_id,
          methode_paiement: p.methode_paiement,
          montant: montants[i],
        });
      }

      await client.query('COMMIT');

      for (const fn of afterCommits) {
        try {
          await fn();
        } catch (err) {
          // La vente est validée : un échec d'audit ou de notification ne la défait pas.
          logger.error({ err }, 'Vente comptoir : suite après validation en échec');
        }
      }

      return {
        idempotent: false,
        facture_id: facture.result.id,
        numero_facture: facture.result.numero_facture,
        total,
        paiements: enregistres,
        especes_recues: especes_recues ?? null,
        monnaie_rendue: monnaieRendue,
        message: describeVente(facture.result.numero_facture, total, enregistres, monnaieRendue),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async walkInClientId(client: { query: typeof pool.query }): Promise<number> {
    const { rows } = await client.query(
      `SELECT id FROM tiers WHERE code = $1 AND deleted_at IS NULL AND est_client = true LIMIT 1`,
      [WALK_IN_CLIENT_CODE]
    );
    if (rows.length === 0) {
      throw businessError(
        422,
        'Aucun client comptoir n’est configuré. Créez un client « Client comptoir » ou choisissez un client.'
      );
    }
    return rows[0].id;
  }

  /** Vente déjà enregistrée par cette clé (premier paiement `<clé>:1`). */
  private async findByIdempotencyKey(key: string): Promise<VenteComptoirResult | null> {
    const { rows } = await pool.query(
      `SELECT f.id, f.numero_facture, f.total
       FROM paiements p
       JOIN factures f ON f.id = p.facture_id
       WHERE p.idempotency_key = $1 AND p.deleted_at IS NULL
       LIMIT 1`,
      [`${key}:1`]
    );
    if (rows.length === 0) return null;
    const facture = rows[0];
    const { rows: pays } = await pool.query(
      `SELECT id, methode_paiement, montant
       FROM paiements
       WHERE facture_id = $1 AND deleted_at IS NULL AND idempotency_key LIKE $2
       ORDER BY id`,
      [facture.id, `${key}:%`]
    );
    const enregistres = pays.map((p: any) => ({
      paiement_id: p.id,
      methode_paiement: p.methode_paiement as PaymentMethod,
      montant: roundMoney(parseFloat(p.montant)),
    }));
    const total = roundMoney(parseFloat(facture.total));
    return {
      idempotent: true,
      facture_id: facture.id,
      numero_facture: facture.numero_facture,
      total,
      paiements: enregistres,
      especes_recues: null,
      monnaie_rendue: 0,
      message: `Vente ${facture.numero_facture} déjà enregistrée.`,
    };
  }
}

/** « Vente FAC-… : 12 500 FCFA payés en espèces. Monnaie à rendre : 2 500 FCFA. » */
function describeVente(
  numero: string,
  total: number,
  paiements: VenteComptoirResult['paiements'],
  monnaie: number
): string {
  const modes = paiements.length === 1
    ? `payés ${paymentMethodPhrase(paiements[0].methode_paiement)}`
    : `payés en ${paiements.length} modes`;
  const rendu = monnaie > EPSILON ? ` Monnaie à rendre : ${formatMontantFcfa(monnaie)}.` : '';
  return `Vente ${numero} : ${formatMontantFcfa(total)} ${modes}.${rendu}`;
}

export const venteComptoirService = new VenteComptoirService();
