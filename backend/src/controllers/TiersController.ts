import { Request, Response } from 'express';
import { tiersService } from '../services/TiersService';
import { ClientAllocationService } from '../services/ClientAllocationService';
import { CompensationService } from '../services/CompensationService';
import { acompteService } from '../services/AcompteService';
import { pdfService } from '../services/PDFService';
import { SupplierAllocationService } from '../services/SupplierAllocationService';
import { businessStatusOf, respondWithError } from '../utils/errors';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../middleware/audit';

/** Roles that may create contacts, but only clients without credit terms (D4). */
const CLIENT_ONLY_CREATOR_ROLES = ['caissier', 'magasin_staff'];

export class TiersController {

  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const { search, role, page, limit, sort, order, statut_solde } = req.query;
      const result = await tiersService.getAll({
        search: search as string,
        role: role as any,
        page: parseInt(page as string) || 1,
        limit: parseInt(limit as string) || 20,
        sort: sort as string,
        order: (order as string)?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC',
        statut_solde: statut_solde as any,
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('TiersController:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const tiers = await tiersService.getById(id);
      if (!tiers) { res.status(404).json({ success: false, error: 'Contact introuvable' }); return; }
      res.json({ success: true, data: tiers });
    } catch (err: any) {
      console.error('TiersController:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  /**
   * Create a contact.
   *
   * Decision D4 (2026-10-23): `caissier` and `magasin_staff` may create a
   * CLIENT from the sales forms (TiersPicker « Créer le client »). For them the
   * contact is always client-only, without credit terms: asking for a supplier
   * or for credit (plafond > 0, délai autre qu'immédiat) is refused with 403 —
   * those stay with the gérant/administrateur.
   */
  static async create(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      let input = req.body;

      if (user && CLIENT_ONLY_CREATOR_ROLES.includes(user.role)) {
        if (input.est_fournisseur === true) {
          res.status(403).json({
            success: false,
            error: 'Vous pouvez créer un client, pas un fournisseur. La création d’un fournisseur est réservée au gérant.',
          });
          return;
        }
        const delai = typeof input.delai_paiement === 'string' ? input.delai_paiement.trim() : '';
        if (Number(input.credit_max ?? 0) > 0 || (delai !== '' && delai !== 'immediat')) {
          res.status(403).json({
            success: false,
            error: 'Le plafond de crédit et le délai de paiement d’un client sont fixés par le gérant.',
          });
          return;
        }
        input = { ...input, est_client: true, est_fournisseur: false, credit_max: 0, delai_paiement: delai || undefined };
      }

      const tiers = await tiersService.create(input);

      await logAudit({
        utilisateur_id: user?.id ?? null,
        action: 'create',
        table_name: 'tiers',
        record_id: tiers.id,
        req,
        new_values: {
          raison_sociale: tiers.raison_sociale,
          est_client: tiers.est_client,
          est_fournisseur: tiers.est_fournisseur,
          credit_max: tiers.credit_max,
        },
      });

      res.status(201).json({ success: true, data: tiers, message: 'Contact créé' });
    } catch (err: any) {
      respondWithError(res, err, 'TiersController.create', 'Erreur serveur');
    }
  }

  /** GET /tiers/comptoir — the walk-in client (code PASS), 404 when none. */
  static async getComptoir(_req: Request, res: Response): Promise<void> {
    try {
      const tiers = await tiersService.getComptoir();
      if (!tiers) {
        res.status(404).json({
          success: false,
          error: 'Aucun client comptoir n’est configuré. Créez un client « Client comptoir » ou demandez-le à l’administrateur.',
        });
        return;
      }
      res.json({ success: true, data: tiers });
    } catch (err: any) {
      respondWithError(res, err, 'TiersController.getComptoir', 'Erreur serveur');
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const tiers = await tiersService.update(id, req.body);
      if (!tiers) { res.status(404).json({ success: false, error: 'Contact introuvable' }); return; }
      res.json({ success: true, data: tiers });
    } catch (err: any) {
      respondWithError(res, err, 'TiersController.update', 'Erreur serveur');
    }
  }

  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const ok = await tiersService.softDelete(id);
      if (!ok) { res.status(404).json({ success: false, error: 'Contact introuvable' }); return; }
      res.json({ success: true, message: 'Contact supprimé' });
    } catch (err: any) {
      console.error('TiersController:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async search(req: Request, res: Response): Promise<void> {
    try {
      const { q, role } = req.query;
      if (!q) { res.json({ success: true, data: [] }); return; }
      const results = await tiersService.search(q as string, role as any);
      res.json({ success: true, data: results });
    } catch (err: any) {
      console.error('TiersController:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getCompte(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { from, to } = req.query;
      const compte = await tiersService.getCompte(id, { from: from as string, to: to as string });
      if (!compte) { res.status(404).json({ success: false, error: 'Contact introuvable' }); return; }
      res.json({ success: true, data: compte });
    } catch (err: any) {
      console.error('TiersController:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getReleveDetaille(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { from, to } = req.query;
      const releve = await tiersService.getReleveDetaille(id, { from: from as string, to: to as string });
      if (!releve) { res.status(404).json({ success: false, error: 'Contact introuvable' }); return; }
      res.json({ success: true, data: releve });
    } catch (err: any) {
      console.error('TiersController:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getRelevePDF(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { res.status(400).json({ success: false, error: 'Identifiant invalide' }); return; }
      const { from, to } = req.query;
      const buffer = await pdfService.generateRelevePDF(id, from as string, to as string);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="releve-client-${id}.pdf"`);
      res.send(buffer);
    } catch (err: any) {
      if (err.statusCode) {
        res.status(err.statusCode).json({ success: false, error: err.message });
        return;
      }
      console.error('TiersController.getRelevePDF:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async promouvoir(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { role } = req.body;
      let tiers;
      if (role === 'client') tiers = await tiersService.promouvoirEnClient(id);
      else if (role === 'fournisseur') tiers = await tiersService.promouvoirEnFournisseur(id);
      else { res.status(422).json({ success: false, error: 'Rôle invalide : choisissez client ou fournisseur.' }); return; }
      if (!tiers) { res.status(404).json({ success: false, error: 'Contact introuvable' }); return; }
      res.json({ success: true, data: tiers });
    } catch (err: any) {
      console.error('TiersController:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async recordAcompteClient(req: Request, res: Response): Promise<void> {
    try {
      const result = await acompteService.createClient({
        tiersId: parseInt(req.params.id),
        montant: req.body.montant,
        methode_paiement: req.body.methode_paiement,
        notes: req.body.notes,
        magasin_id: req.body.magasin_id,
        reference_number: req.body.reference_number,
        session_caisse_id: req.body.session_caisse_id,
        idempotency_key: req.body.idempotency_key,
        userId: (req as any).user?.id || null,
      });
      if (result.idempotent) {
        res.status(200).json({ success: true, data: result.acompte, idempotent: true });
        return;
      }
      res.status(201).json({ success: true, data: { ...result.acompte, mouvement_caisse_id: result.mouvement_caisse_id } });
    } catch (err: any) {
      const status = businessStatusOf(err);
      if (status) {
        res.status(status).json({ success: false, error: err.message, ...(err.code ? { code: err.code } : {}) });
        return;
      }
      console.error('TiersController acompte:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async recordAcompteFournisseur(req: Request, res: Response): Promise<void> {
    try {
      const result = await acompteService.createFournisseur({
        tiersId: parseInt(req.params.id),
        montant: req.body.montant,
        methode_paiement: req.body.methode_paiement,
        notes: req.body.notes,
        magasin_id: req.body.magasin_id,
        reference_number: req.body.reference_number,
        session_caisse_id: req.body.session_caisse_id,
        idempotency_key: req.body.idempotency_key,
        userId: (req as any).user?.id || null,
      });
      if (result.idempotent) {
        res.status(200).json({ success: true, data: result.acompte, idempotent: true });
        return;
      }
      res.status(201).json({
        success: true,
        data: { ...result.acompte, mouvement_caisse_id: result.mouvement_caisse_id, allocation: result.allocation },
      });
    } catch (err: any) {
      const status = businessStatusOf(err);
      if (status) {
        res.status(status).json({ success: false, error: err.message, ...(err.code ? { code: err.code } : {}) });
        return;
      }
      console.error('TiersController acompte:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async createCompensation(req: Request, res: Response): Promise<void> {
    try {
      const tiersId = parseInt(req.params.id);
      const result = await CompensationService.create({
        ...req.body,
        tiers_id: tiersId,
        cree_par: (req as any).user?.id,
      });
      res.status(201).json({ success: true, data: result });
    } catch (err: any) {
      const status = err.message?.includes('période') || err.message?.includes('rôle') || err.message?.includes('supérieur') ? 422 : 500;
      if (status === 500) {
        console.error('TiersController.createCompensation:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
        return;
      }
      res.status(status).json({ success: false, error: err.message });
    }
  }

  static async getCompensations(req: Request, res: Response): Promise<void> {
    try {
      const tiersId = parseInt(req.params.id);
      const data = await CompensationService.getForTiers(tiersId);
      res.json({ success: true, data });
    } catch (err: any) {
      console.error('TiersController:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async recomputeAllocation(req: Request, res: Response): Promise<void> {
    try {
      const tiersId = parseInt(req.params.id);
      const role = (req.query.role as string) || req.body?.role || 'client';
      if (role === 'fournisseur') {
        const result = await SupplierAllocationService.recomputeSupplierState(tiersId, {
          userId: (req as any).user?.id ?? null,
        });
        res.json({ success: true, data: result });
        return;
      }
      // Same safe engine as the global re-spread: every payment back on its own
      // invoice (E1), and no available deposit spent as a side effect (D3).
      const report = await ClientAllocationService.reallocateClient(tiersId, {
        apply: true,
        acceptEcart: true,
        userId: (req as AuthRequest).user?.id ?? null,
      });
      if (report.statut === 'erreur') {
        res.status(500).json({ success: false, error: report.erreur });
        return;
      }
      // E1-R1: say where the surplus of a payment beyond its invoice goes.
      const reportes = ClientAllocationService.describeReports(report.paiements_reportes);
      res.json({
        success: true,
        data: report,
        message: (report.factures.length > 0
          ? `Paiements réimputés : ${report.factures.length} facture(s) mise(s) à jour.`
          : 'Paiements vérifiés : aucune facture ne change.') + (reportes ? ` ${reportes}` : ''),
      });
    } catch (err: any) {
      console.error('TiersController:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  /**
   * POST /api/tiers/recompute-allocations (admin) — one-time E1 re-spread of
   * every client: each payment back on the invoice it was recorded on, account
   * totals unchanged. Simulation unless `appliquer: true`; a client whose total
   * paid would change is reported and left alone unless `accepter_ecarts: true`.
   */
  static async recomputeAllAllocations(req: Request, res: Response): Promise<void> {
    try {
      const apply = req.body?.appliquer === true;
      const acceptEcart = req.body?.accepter_ecarts === true;
      const report = await ClientAllocationService.reallocateAllClients({
        apply,
        acceptEcart,
        userId: (req as AuthRequest).user?.id ?? null,
        tiersId: req.body?.tiers_id ? Number(req.body.tiers_id) : undefined,
      });
      const ecarts = report.clients_ecart === 0
        ? ''
        : apply && acceptEcart
          ? ` Dont ${report.clients_ecart} client(s) dont le total payé ou le crédit d’acompte a changé.`
          : ` ${report.clients_ecart} client(s) dont le total payé ou le crédit d’acompte changerait : non modifié(s), à vérifier.`;
      const erreurs = report.clients_erreur > 0
        ? ` ${report.clients_erreur} client(s) en erreur : non modifié(s).`
        : '';
      // E1-R1: payments beyond their invoice, listed per client in `details[].paiements_reportes`.
      const reportes = report.paiements_reportes === 0
        ? ''
        : report.paiements_reportes === 1
          ? ' 1 paiement dépasse la facture sur laquelle il a été enregistré : son surplus est reporté (détail par client).'
          : ` ${report.paiements_reportes} paiements dépassent la facture sur laquelle ils ont été enregistrés : leur surplus est reporté (détail par client).`;
      const message = apply
        ? `Réimputation appliquée : ${report.clients_modifies} client(s), ${report.factures_modifiees} facture(s) mise(s) à jour.${ecarts}${erreurs}${reportes}`
        : `Simulation : ${report.clients_modifies} client(s) et ${report.factures_modifiees} facture(s) changeraient. Rien n’a été modifié.${ecarts}${erreurs}${reportes}`;
      res.json({ success: true, data: report, message });
    } catch (err: unknown) {
      respondWithError(res, err, 'TiersController.recomputeAllAllocations', 'Erreur serveur');
    }
  }
}
