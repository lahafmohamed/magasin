import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/api', () => ({
  factureService: { getById: vi.fn() },
  companySettingsService: { get: vi.fn() },
}));

import { factureService, companySettingsService } from '@/services/api';
import { buildTicketHtml, loadTicketData, type TicketData } from './ticket';

const mocked = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
const plain = (text: string) => text.split(String.fromCharCode(0xa0)).join(' ').split(String.fromCharCode(0x202f)).join(' ');

const base: TicketData = {
  entreprise: { nom: 'Boutique Awa', adresse: 'Cocody\nAbidjan', telephone: '07 00 00 00', nif: 'N123', rc: null },
  numero: 'FAC-2026-00120',
  date: '2026-11-09T10:30:00',
  caissier: 'Awa',
  client: null,
  lignes: [{ nom: 'T-shirt <bleu>', quantite: 2, prixUnitaire: 2500, total: 5000 }],
  sousTotal: 5000,
  remise: 0,
  total: 5000,
  paiements: [{ methode: 'espece', montant: 5000 }],
  especesRecues: 10000,
  monnaieRendue: 5000,
  message: 'Merci de votre visite',
};

describe('buildTicketHtml', () => {
  it('produit un ticket 80 mm échappé, avec total, règlement, monnaie et message', () => {
    const html = plain(buildTicketHtml(base));
    expect(html).toContain('@page { size: 80mm auto; margin: 0; }');
    expect(html).toContain('T-shirt &lt;bleu&gt;');
    expect(html).not.toContain('<bleu>');
    expect(html).toContain('Cocody<br />Abidjan');
    expect(html).toContain('5 000 FCFA');
    expect(html).toContain('Espèces');
    expect(html).toContain('Espèces reçues');
    expect(html).toContain('Monnaie rendue');
    expect(html).toContain('Merci de votre visite');
    expect(html).toContain('NIF N123');
    expect(html).not.toContain('Client</span>');
  });

  it('omet la monnaie quand la vente ne l’a pas connue (réimpression) et nomme un vrai client', () => {
    const html = buildTicketHtml({ ...base, especesRecues: null, monnaieRendue: null, client: 'Koffi Yao', message: null });
    expect(html).not.toContain('Monnaie rendue');
    expect(html).toContain('Koffi Yao');
    expect(html).not.toContain('class="message"');
  });
});

describe('loadTicketData', () => {
  beforeEach(() => {
    mocked(companySettingsService.get).mockResolvedValue({
      nom: 'Boutique Awa',
      logo_url: '/logo.png',
      ticket_message: 'Échange sous 7 jours',
    });
  });

  it('ne nomme pas le client comptoir et ignore le logo livré par défaut', async () => {
    mocked(factureService.getById).mockResolvedValue({
      numero_facture: 'FAC-1',
      date_facture: '2026-11-09T10:30:00',
      client_nom: 'Client comptoir',
      client_code: 'PASS',
      cree_par_nom: 'Awa',
      total: '4500.00',
      sous_total: '5000.00',
      lignes: [{ produit_nom: 'Jean', quantite: '1', prix_unitaire: '5000.00', total_ligne: '5000.00' }],
      paiements: [{ methode_paiement: 'wave', montant: '4500.00' }],
    });
    const data = await loadTicketData(1);
    expect(data.client).toBeNull();
    expect(data.entreprise.logoUrl).toBeNull();
    expect(data.remise).toBe(500);
    expect(data.paiements).toEqual([{ methode: 'wave', montant: 4500 }]);
    expect(data.message).toBe('Échange sous 7 jours');
    expect(data.caissier).toBe('Awa');
  });
});
