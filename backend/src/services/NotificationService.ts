import { Request, Response } from 'express';
import { logger } from '../utils/logger';

interface SSEClient {
  id: number;
  res: Response;
}

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
  static addClient(req: Request, res: Response): number {
    const id = ++this.clientIdCounter;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    res.write(`id: ${id}\ndata: ${JSON.stringify({ type: 'connected', clientId: id })}\n\n`);

    const client: SSEClient = { id, res };
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
   * Envoie un événement à tous les clients connectés
   */
  static broadcast(event: string, data: any): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const activeClients: SSEClient[] = [];
    this.clients.forEach(client => {
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
  } = {}): void {
    this.broadcast('notification', {
      title,
      message,
      type: options.type || 'info',
      link: options.link,
      timestamp: new Date().toISOString(),
    });
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
      `${facture.numero} — ${facture.client_nom} : ${facture.total.toLocaleString('fr-FR')} FCFA`,
      { type: 'success', link: `/factures/${facture.id}` }
    );
  }

  /**
   * Envoie une notification quand un paiement est enregistré
   */
  static paymentReceived(paiement: { facture_numero: string; montant: number; methode: string }): void {
    this.notify(
      'Paiement reçu',
      `${paiement.facture_numero} — ${paiement.montant.toLocaleString('fr-FR')} FCFA (${paiement.methode})`,
      { type: 'success' }
    );
  }

  static getClientCount(): number {
    return this.clients.length;
  }
}
