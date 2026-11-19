import { companySettingsService, factureService } from '@/services/api';
import { formatCurrency, formatDateTime, formatNumber, toNumber } from '@/utils/format';
import { formatPaymentMethod } from '@/utils/paymentMethod';
import { printHtml } from '@/utils/print';


/**
 * Ticket de caisse 80 mm (lot 2).
 *
 * Imprimé par le navigateur (`window.print()` dans un cadre caché) : ça marche
 * avec n'importe quelle imprimante thermique installée sous Windows, sans
 * logiciel à poser chez le client. Le tiroir-caisse s'ouvre par le réglage
 * « ouvrir le tiroir à l'impression » du pilote de l'imprimante.
 *
 * Le ticket est un document HTML autonome (styles en ligne) : la feuille de
 * style de l'application, ses couleurs et son thème sombre n'y entrent pas.
 */

export interface TicketLigne {
  nom: string;
  quantite: number;
  prixUnitaire: number;
  total: number;
}

export interface TicketPaiement {
  methode: string;
  montant: number;
}

export interface TicketData {
  entreprise: {
    nom: string;
    adresse?: string | null;
    telephone?: string | null;
    nif?: string | null;
    rc?: string | null;
    logoUrl?: string | null;
  };
  numero: string;
  date: string | Date;
  caissier?: string | null;
  /** Rien pour le client comptoir : le ticket ne nomme qu'un vrai client. */
  client?: string | null;
  lignes: TicketLigne[];
  sousTotal: number;
  remise: number;
  total: number;
  paiements: TicketPaiement[];
  /** Espèces remises et monnaie rendue : connues seulement au moment de la vente. */
  especesRecues?: number | null;
  monnaieRendue?: number | null;
  message?: string | null;
}

/** Code du client de passage : le ticket ne l'imprime pas. */
const COMPTOIR_CODE = 'PASS';
const LOGO_PAR_DEFAUT = '/logo.png';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value: number): string {
  return escapeHtml(formatCurrency(value));
}

function row(label: string, value: string, strong = false): string {
  const tag = strong ? 'strong' : 'span';
  return `<div class="row${strong ? ' total' : ''}"><${tag}>${label}</${tag}><${tag} class="num">${value}</${tag}></div>`;
}

/** Document HTML complet du ticket, prêt à imprimer. */
export function buildTicketHtml(data: TicketData): string {
  const e = data.entreprise;
  const entete = [
    e.logoUrl ? `<img class="logo" src="${escapeHtml(e.logoUrl)}" alt="" />` : '',
    `<p class="nom">${escapeHtml(e.nom)}</p>`,
    e.adresse ? `<p>${escapeHtml(e.adresse).replace(/\n/g, '<br />')}</p>` : '',
    e.telephone ? `<p>Tél. ${escapeHtml(e.telephone)}</p>` : '',
    e.nif || e.rc
      ? `<p>${[e.nif ? `NIF ${escapeHtml(e.nif)}` : '', e.rc ? `RCCM ${escapeHtml(e.rc)}` : ''].filter(Boolean).join(' · ')}</p>`
      : '',
  ].join('');

  const infos = [
    row('Ticket', escapeHtml(data.numero)),
    row('Date', escapeHtml(formatDateTime(data.date))),
    data.caissier ? row('Caissier', escapeHtml(data.caissier)) : '',
    data.client ? row('Client', escapeHtml(data.client)) : '',
  ].join('');

  const lignes = data.lignes
    .map(
      (l) =>
        `<div class="ligne"><p>${escapeHtml(l.nom)}</p>` +
        row(`${escapeHtml(formatNumber(l.quantite))} × ${money(l.prixUnitaire)}`, money(l.total)) +
        `</div>`
    )
    .join('');

  const articles = data.lignes.reduce((n, l) => n + l.quantite, 0);
  const totaux = [
    data.remise > 0.005 ? row('Sous-total', money(data.sousTotal)) + row('Remise', `−${money(data.remise)}`) : '',
    row('Total', money(data.total), true),
    row('Articles', escapeHtml(formatNumber(articles))),
  ].join('');

  const reglement = [
    ...data.paiements.map((p) => row(escapeHtml(formatPaymentMethod(p.methode)), money(p.montant))),
    data.especesRecues != null && data.especesRecues > 0 ? row('Espèces reçues', money(data.especesRecues)) : '',
    data.monnaieRendue != null && data.especesRecues != null ? row('Monnaie rendue', money(data.monnaieRendue), true) : '',
  ].join('');

  const message = data.message?.trim()
    ? `<p class="message">${escapeHtml(data.message.trim()).replace(/\n/g, '<br />')}</p>`
    : '';

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Ticket ${escapeHtml(data.numero)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { width: 80mm; padding: 4mm 4mm 8mm; font: 12px/1.35 "Segoe UI", Arial, sans-serif; }
  p { margin: 0; }
  .entete { text-align: center; margin-bottom: 3mm; }
  .entete p { font-size: 11px; }
  .entete .nom { font-size: 15px; font-weight: 700; margin-bottom: 1mm; }
  .logo { display: block; max-width: 40mm; max-height: 18mm; margin: 0 auto 2mm; object-fit: contain; }
  .sep { border: 0; border-top: 1px dashed #000; margin: 2.5mm 0; }
  .row { display: flex; justify-content: space-between; gap: 3mm; }
  .num { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .ligne { margin-bottom: 1.5mm; }
  .ligne .row { color: #222; }
  .total { font-size: 15px; margin: 1mm 0; }
  .message { text-align: center; margin-top: 3mm; font-size: 11px; }
</style>
</head>
<body>
  <div class="entete">${entete}</div>
  ${infos}
  <hr class="sep" />
  ${lignes}
  <hr class="sep" />
  ${totaux}
  <hr class="sep" />
  ${reglement}
  ${message}
</body>
</html>`;
}

/**
 * Données du ticket d'une facture : la facture enregistrée et l'identité de
 * l'entreprise. `extra` porte ce que seule la vente connaît (espèces reçues,
 * monnaie rendue).
 */
export async function loadTicketData(
  factureId: number,
  extra: Pick<TicketData, 'especesRecues' | 'monnaieRendue'> = {}
): Promise<TicketData> {
  const [facture, settings] = await Promise.all([factureService.getById(factureId), companySettingsService.get()]);
  // La réponse de l'API porte plus de champs que le type partagé (vendeur, code client).
  const f = facture as typeof facture & Record<string, unknown>;
  const lignes: TicketLigne[] = (facture.lignes ?? []).map((l) => {
    const ligne = l as unknown as Record<string, unknown>;
    const quantite = toNumber(ligne.quantite as number | string) ?? 0;
    const prixUnitaire = toNumber(ligne.prix_unitaire as number | string) ?? 0;
    return {
      nom: String(ligne.produit_nom ?? ligne.designation ?? 'Article'),
      quantite,
      prixUnitaire,
      total: toNumber(ligne.total_ligne as number | string) ?? quantite * prixUnitaire,
    };
  });
  const total = toNumber(f.total as number | string) ?? 0;
  const sousTotal = toNumber(f.sous_total as number | string) ?? total;
  const clientCode = typeof f.client_code === 'string' ? f.client_code : null;
  const clientNom = [f.client_nom, f.client_prenom].filter(Boolean).join(' ').trim();
  const estComptoir = clientCode === COMPTOIR_CODE || /^client (comptoir|passager)$/i.test(clientNom);
  const logo = settings?.logo_url?.trim() || null;

  return {
    entreprise: {
      nom: settings?.nom?.trim() || 'Ticket de caisse',
      adresse: settings?.adresse,
      telephone: settings?.telephone,
      nif: settings?.nif,
      rc: settings?.rc,
      logoUrl: logo && logo !== LOGO_PAR_DEFAUT ? logo : null,
    },
    numero: String(f.numero_facture ?? ''),
    date: (f.date_facture as string) ?? new Date(),
    caissier: typeof f.cree_par_nom === 'string' ? f.cree_par_nom : null,
    client: estComptoir || !clientNom ? null : clientNom,
    lignes,
    sousTotal,
    remise: Math.max(0, sousTotal - total),
    total,
    paiements: (facture.paiements ?? []).map((p) => ({
      methode: String((p as unknown as Record<string, unknown>).methode_paiement ?? ''),
      montant: toNumber((p as unknown as Record<string, unknown>).montant as number | string) ?? 0,
    })),
    especesRecues: extra.especesRecues ?? null,
    monnaieRendue: extra.monnaieRendue ?? null,
    message: settings?.ticket_message ?? null,
  };
}

/** Charge et imprime le ticket d'une facture. */
export async function printTicket(
  factureId: number,
  extra: Pick<TicketData, 'especesRecues' | 'monnaieRendue'> = {}
): Promise<void> {
  const data = await loadTicketData(factureId, extra);
  await printHtml(buildTicketHtml(data));
}
