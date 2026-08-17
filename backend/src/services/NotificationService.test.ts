import { describe, expect, it, afterEach } from 'vitest';
import { NotificationService } from './NotificationService';

/**
 * Faux client SSE : capture les trames écrites et expose le handler `close`
 * pour pouvoir détacher le client (et son heartbeat) après chaque test.
 */
function fakeClient(role: string) {
  const frames: string[] = [];
  let closeHandler: (() => void) | undefined;

  const req = {
    on: (event: string, handler: () => void) => {
      if (event === 'close') closeHandler = handler;
    },
  } as any;

  const res = {
    writeHead: () => res,
    write: (chunk: string) => {
      frames.push(chunk);
      return true;
    },
  } as any;

  NotificationService.addClient(req, res, { id: 1, role });

  return {
    frames,
    close: () => closeHandler?.(),
    /** Trames d'événement reçues, hors trame initiale `connected` et heartbeats. */
    events: () => frames.filter((f) => f.startsWith('event:')),
  };
}

describe('NotificationService — portée des diffusions', () => {
  const opened: { close: () => void }[] = [];

  const open = (role: string) => {
    const c = fakeClient(role);
    opened.push(c);
    return c;
  };

  afterEach(() => {
    opened.splice(0).forEach((c) => c.close());
  });

  it('réserve les notifications financières aux rôles qui y ont accès', () => {
    const admin = open('admin');
    const manager = open('manager');
    const caissier = open('caissier');

    NotificationService.invoiceCreated({
      id: 7,
      numero: 'FAC-2026-00007',
      total: 125000,
      client_nom: 'Kouassi Informatique',
    });

    expect(admin.events()).toHaveLength(1);
    expect(manager.events()).toHaveLength(1);
    // Un caissier ne doit pas recevoir le montant et le nom du client.
    expect(caissier.events()).toHaveLength(0);
    expect(admin.events()[0]).toContain('FAC-2026-00007');
  });

  it('réserve les paiements aux mêmes rôles', () => {
    const admin = open('admin');
    const depot = open('depot_staff');

    NotificationService.paymentReceived({
      facture_numero: 'FAC-2026-00007',
      montant: 50000,
      methode: 'espece',
    });

    expect(admin.events()).toHaveLength(1);
    expect(depot.events()).toHaveLength(0);
  });

  it('diffuse les alertes de stock à tous les rôles connectés', () => {
    const admin = open('admin');
    const caissier = open('caissier');

    NotificationService.lowStockAlert({
      id: 3,
      nom: 'Clavier Logitech K120',
      reference: 'CLV-001',
      stock: 2,
      stock_min: 5,
    });

    expect(admin.events()).toHaveLength(1);
    expect(caissier.events()).toHaveLength(1);
    // Le produit est nommé dans la charge utile : l'UI n'a pas à le deviner.
    expect(caissier.events()[0]).toContain('CLV-001');
  });

  it('envoie la trame initiale « connected » à la connexion', () => {
    const client = open('caissier');
    expect(client.frames[0]).toContain('"type":"connected"');
  });
});
