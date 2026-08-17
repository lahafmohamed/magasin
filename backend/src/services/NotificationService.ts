import { Request, Response } from 'express';
import pool from '../db/connection';
import { logger } from '../utils/logger';

interface SSEClient {
  id: number;
  res: Response;
  /** Rôle du porteur du token, pour ne pousser un événement qu'aux destinataires légitimes. */
  role?: string;
  utilisateurId?: number;
}

/** Rôles autorisés à recevoir les événements portant des montants/clients. */
const FINANCIAL_ROLES = ['admin', 'manager'];

/**
 * Service de notifications temps réel via Server-Sent Events (SSE).
 * Permet de pousser des événements vers les clients connectés sans polling.
 */
export class NotificationService {
  private static clients: SSEClient[] = [];
  private static clientIdCounter = 0;

  /**
   * Ajoute un client SSE et lui envoie un événement initial "connected"
   */
  static addClient(req: Request, res: Response, user?: { id: number; role: string }): number {
    const id = ++this.clientIdCounter;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    res.write(`id: ${id}\ndata: ${JSON.stringify({ type: 'connected', clientId: id })}\n\n`);

    const client: SSEClient = { id, res, role: user?.role, utilisateurId: user?.id };
    this.clients.push(client);

    // Heartbeat toutes les 30s pour garder la connexion vivante
    const heartbeat = setInterval(() => {
      try {
        res.write(':\n\n');
      } catch {
        clearInterval(heartbeat);
        this.clients = this.clients.filter(c => c.id !== id);
        logger.info(`SSE client ${id} removed on heartbeat error (${this.clients.length} remaining)`);
      }
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
      this.clients = this.clients.filter(c => c.id !== id);
      logger.info(`SSE client ${id} disconnected (${this.clients.length} remaining)`);
    });

    logger.info(`SSE client ${id} connected (${this.clients.length} total)`);
    return id;
  }

  /**
   * Envoie un événement aux clients connectés. `roles` restreint la diffusion :
   * sans ce filtre, un montant de facture partirait vers toutes les sessions
   * ouvertes, y compris celles qui n'ont pas accès à ces données dans l'app.
   */
  static broadcast(event: string, data: any, options: { roles?: string[] } = {}): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const activeClients: SSEClient[] = [];
    this.clients.forEach(client => {
      const allowed = !options.roles || (!!client.role && options.roles.includes(client.role));
      if (!allowed) {
        activeClients.push(client);
        return;
      }
      try {
        client.res.write(payload);
        activeClients.push(client);
      } catch {
        logger.info(`SSE client ${client.id} failed to write on broadcast, removing.`);
      }
    });
    this.clients = activeClients;
  }

  /**
   * Envoie une notification de type 'notification'
   */
  static notify(title: string, message: string, options: {
    type?: 'info' | 'success' | 'warning' | 'error';
    link?: string;
    roles?: string[];
  } = {}): void {
    this.broadcast('notification', {
      title,
      message,
      type: options.type || 'info',
      link: options.link,
      timestamp: new Date().toISOString(),
    }, { roles: options.roles });
  }

  /**
   * Envoie une alerte de stock faible
   */
  static lowStockAlert(produit: { id: number; nom: string; reference: string; stock: number; stock_min: number }): void {
    this.broadcast('low-stock', {
      produit_id: produit.id,
      nom: produit.nom,
      reference: produit.reference,
      stock: produit.stock,
      stock_min: produit.stock_min,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Envoie une notification quand une facture est créée
   */
  static invoiceCreated(facture: { id: number; numero: string; total: number; client_nom: string }): void {
    this.notify(
      'Nouvelle facture',
      `${facture.numero} — ${facture.client_nom} : ${Number(facture.total).toLocaleString('fr-FR')} FCFA`,
      { type: 'success', link: `/factures/${facture.id}`, roles: FINANCIAL_ROLES }
    );
  }

  /**
   * Envoie une notification quand un paiement est enregistré
   */
  static paymentReceived(paiement: { facture_numero: string; montant: number; methode: string }): void {
    this.notify(
      'Paiement reçu',
      `${paiement.facture_numero} — ${Number(paiement.montant).toLocaleString('fr-FR')} FCFA (${paiement.methode})`,
      { type: 'success', roles: FINANCIAL_ROLES }
    );
  }

  static getClientCount(): number {
    return this.clients.length;
  }

  /**
   * Émet une alerte pour chaque produit vendu qui vient de passer sous son seuil.
   * Appelé APRÈS le commit d'une vente : jamais dans la transaction, jamais bloquant.
   * Le stock lu est le stock consolidé (somme des emplacements), cohérent avec
   * `/produits/alertes-stock`.
   */
  static async checkLowStock(produitIds: number[]): Promise<void> {
    const ids = [...new Set(produitIds)].filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0) return;
    try {
      const { rows } = await pool.query(
        `SELECT p.id, p.nom, p.reference, p.stock_min,
                COALESCE(SUM(spl.quantite), 0)::int AS stock
           FROM produits p
           LEFT JOIN stock_par_location spl ON spl.produit_id = p.id
          WHERE p.id = ANY($1::int[]) AND p.deleted_at IS NULL
          GROUP BY p.id
         HAVING COALESCE(SUM(spl.quantite), 0) <= p.stock_min`,
        [ids]
      );
      for (const produit of rows) {
        this.lowStockAlert(produit);
      }
    } catch (error) {
      // Une alerte manquée ne doit jamais remonter dans le flux de vente.
      logger.warn({ err: error }, 'Low-stock notification check failed');
    }
  }

  /**
   * Enveloppe « au mieux » : une notification ne doit jamais faire échouer
   * l'opération métier qui vient d'être committée.
   */
  static safely(fn: () => void | Promise<void>): void {
    try {
      const result = fn();
      if (result instanceof Promise) {
        result.catch((error) => logger.warn({ err: error }, 'Notification emit failed'));
      }
    } catch (error) {
      logger.warn({ err: error }, 'Notification emit failed');
    }
  }
}
