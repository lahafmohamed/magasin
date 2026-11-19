import { useEffect, useState } from 'react';
import { companySettingsService, CompanySettings } from '../../services/api';
import { buildBrand } from '@/lib/brand';
import { formatCurrency, formatDateNumeric, formatNumber, toNumber } from '@/utils/format';

// ============================================================
// Modèle d'impression commun — devis, facture, bon de livraison, avoir.
// La feuille reste blanche (WYSIWYG papier) quel que soit le thème.
// ============================================================

type DocType = 'devis' | 'facture' | 'bl' | 'avoir';

interface PrintLigne {
  produit_nom?: string;
  produit_reference?: string;
  description?: string;
  quantite: number | string;
  quantite_livree?: number | string;
  prix_unitaire: number | string;
}

interface DocumentPrintProps {
  docType: DocType;
  numero: string;
  dateDoc?: string | Date | null;
  dateEcheance?: string | Date | null;
  vendeur?: string;
  clientNom?: string;
  clientPrenom?: string;
  lignes: PrintLigne[];
  hideTotals?: boolean;
  format?: 'A4' | 'A5';
  /**
   * Facture : montant déjà encaissé. Au-delà de 0, le pied n'affiche plus
   * « Total à payer » (faux pour une facture en partie payée) mais « Total de
   * la facture », « Déjà payé » et « Reste à payer ».
   */
  montantPaye?: number | string | null;
  /**
   * Facture : reste dû tel que calculé par le serveur (remise globale
   * comprise). Par défaut : total imprimé − déjà payé.
   */
  resteAPayer?: number | string | null;
}

const titleLabel: Record<DocType, string> = {
  devis: 'Devis',
  facture: 'Facture',
  bl: 'Bon de livraison',
  avoir: 'Avoir',
};

/** Libellés des colonnes de dates ; `echeance: null` = colonne masquée (un avoir n'a pas d'échéance). */
const dateLabels: Record<DocType, { date: string; echeance: string | null }> = {
  devis: { date: 'Date du devis', echeance: 'Valable jusqu’au' },
  facture: { date: 'Date de la facture', echeance: 'Échéance' },
  bl: { date: 'Date du bon de livraison', echeance: 'Date de livraison' },
  avoir: { date: 'Date de l’avoir', echeance: null },
};

/**
 * Libellé du total selon le document. Un avoir est ce que la boutique DOIT au
 * client : « Total à payer » y était faux (CP-S08).
 */
const totalLabel: Record<DocType, string> = {
  devis: 'Total du devis',
  facture: 'Total à payer',
  bl: 'Total',
  avoir: 'Montant de l’avoir',
};

/** Date numérique « 22/10/2026 » : le format papier. */
const fmtDate = (d?: string | Date | null) => formatDateNumeric(d);

/** Quantité : entier sans décimales (« 2 », pas « 2,00 »), décimales seulement si utiles. */
const fmtQty = (n: number) => formatNumber(n, 2);

/** « Administrator » n'est pas un vendeur : nom inconnu → colonne masquée (CP-S09). */
const sellerName = (v?: string) => {
  const name = v?.trim();
  return name && !/^administrator$/i.test(name) ? name : null;
};

export function DocumentPrint({
  docType,
  numero,
  dateDoc,
  dateEcheance,
  vendeur,
  clientNom,
  clientPrenom,
  lignes,
  hideTotals = false,
  format = 'A4',
  montantPaye,
  resteAPayer,
}: DocumentPrintProps) {
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  useEffect(() => {
    companySettingsService.get().then(setSettings).catch(() => {});
  }, []);

  const isTicket = format === 'A5';

  const rows = lignes.map((l) => {
    const qte = Number(docType === 'bl' ? (l.quantite_livree ?? l.quantite) : l.quantite) || 0;
    const pu = Number(l.prix_unitaire) || 0;
    const montant = qte * pu;
    return { ...l, qte, pu, montant };
  });

  const sousTotal = rows.reduce((s, r) => s + r.montant, 0);

  const labels = dateLabels[docType];
  const seller = sellerName(vendeur);
  const metaCols = 1 + (labels.echeance ? 1 : 0) + (seller ? 1 : 0);
  const clientFull = [clientNom, clientPrenom].filter(Boolean).join(' ').trim();
  const devise = settings?.devise || 'FCFA';
  const fmtMoney = (n: number) => formatCurrency(n, devise);
  const companyName = settings?.nom || '';
  // Logo du client seulement : jamais le `/logo.png` livré (bannière Hitek sur
  // damier gris), ni d'image vide quand aucun logo n'est enregistré.
  const logoUrl = buildBrand(settings).logoUrl;
  const paid = docType === 'facture' ? Math.max(0, toNumber(montantPaye) ?? 0) : 0;
  const partPaid = paid > 0;
  const reste = Math.max(0, toNumber(resteAPayer) ?? sousTotal - paid);
  const contactInfo = [settings?.adresse, settings?.telephone, settings?.email].filter(Boolean).join(' · ');

  return (
    <div className="pbd-print-doc">
      <div className={`pbd-print-page ${isTicket ? 'pbd-ticket' : ''}`}>
        {/* Header: logo + company addr */}
        <div className="pbd-header">
          {/* Le nom de la société est écrit à côté : le logo est décoratif. */}
          {logoUrl && <img src={logoUrl} alt={companyName ? '' : 'Logo'} className="pbd-logo" />}
          <div className="pbd-company">
            <div className="pbd-company-name">{companyName}</div>
            {settings?.adresse && <div>{settings.adresse}</div>}
            <div className="pbd-tax-ids">
              {settings?.nif && <span>NIF : {settings.nif}</span>}
              {settings?.rc && <span>RCCM : {settings.rc}</span>}
            </div>
          </div>
        </div>

        {/* Client name centered */}
        <div className="pbd-client">{clientFull || '—'}</div>

        {/* Title */}
        <h1 className="pbd-title">
          {titleLabel[docType]} n° {numero}
        </h1>

        {/* Colonnes d'en-tête : échéance et vendeur seulement s'ils existent. */}
        <div className="pbd-meta" style={{ gridTemplateColumns: `repeat(${metaCols}, minmax(0, 1fr))` }}>
          <div>
            <div className="pbd-meta-label">{labels.date}</div>
            <div>{fmtDate(dateDoc)}</div>
          </div>
          {labels.echeance && (
            <div>
              <div className="pbd-meta-label">{labels.echeance}</div>
              <div>{fmtDate(dateEcheance)}</div>
            </div>
          )}
          {seller && (
            <div>
              <div className="pbd-meta-label">Vendeur</div>
              <div>{seller}</div>
            </div>
          )}
        </div>

        {/* Items table */}
        <table className="pbd-table">
          <thead>
            <tr>
              <th className="pbd-col-desc">Désignation</th>
              <th className="pbd-col-qte">Quantité</th>
              <th className="pbd-col-pu">Prix unitaire</th>
              <th className="pbd-col-mt">Montant</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const refTag = r.produit_reference ? `[${r.produit_reference}] ` : '';
              const mainName = r.produit_nom || r.description || '';
              const subDesc = r.produit_reference && r.description && r.description !== r.produit_nom
                ? r.description
                : '';
              return (
                <tr key={i}>
                  <td className="pbd-col-desc">
                    <div>{refTag}{mainName}</div>
                    {subDesc && <div className="pbd-subdesc">{subDesc}</div>}
                  </td>
                  <td className="pbd-col-qte">{fmtQty(r.qte)}</td>
                  <td className="pbd-col-pu">{fmtMoney(r.pu)}</td>
                  <td className="pbd-col-mt">{fmtMoney(r.montant)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals */}
        {!hideTotals && (
          <div className="pbd-totals">
            {/* Une seule ligne (ni taxe ni remise) : « Montant total » répétait le même nombre.
                Facture en partie payée : le client lit ce qu'il doit encore, pas le total. */}
            <div className="pbd-totals-box">
              {partPaid ? (
                <>
                  <div className="pbd-total-row">
                    <span>Total de la facture</span>
                    <span className="pbd-num">{fmtMoney(sousTotal)}</span>
                  </div>
                  <div className="pbd-total-row">
                    <span>Déjà payé</span>
                    <span className="pbd-num">{fmtMoney(paid)}</span>
                  </div>
                  <div className="pbd-total-row pbd-total-grand">
                    <span>Reste à payer</span>
                    <span>{fmtMoney(reste)}</span>
                  </div>
                </>
              ) : (
                <div className="pbd-total-row pbd-total-grand">
                  <span>{totalLabel[docType]}</span>
                  <span>{fmtMoney(sousTotal)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tax IDs in footer */}
        <div className="pbd-footer-ids">
          {settings?.ai && <span>AI : {settings.ai}</span>}
          {settings?.cb && <span>Compte bancaire : {settings.cb}</span>}
        </div>

        {/* Footer */}
        {/* Plus de « Page 1 / 1 » codé en dur, faux dès la deuxième page. */}
        <div className="pbd-footer">
          <span>{contactInfo}</span>
        </div>
      </div>

      <style>{`
        .pbd-print-doc {
          background: #fff;
          color: #111;
          font-family: 'Helvetica Neue', Arial, sans-serif;
        }
        .pbd-print-page {
          max-width: 800px;
          margin: 0 auto;
          padding: 32px 40px 80px;
          position: relative;
          min-height: 1050px;
        }
        .pbd-print-page.pbd-ticket {
          max-width: 200mm;
          min-height: auto;
          padding: 16px 20px 60px;
        }
        .pbd-header {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 60px;
        }
        .pbd-logo {
          width: 130px;
          height: auto;
          object-fit: contain;
        }
        .pbd-company {
          font-size: 12px;
          line-height: 1.5;
          color: #222;
        }
        .pbd-company-name {
          font-size: 14px;
          font-weight: 700;
        }
        .pbd-tax-ids {
          display: flex;
          flex-wrap: wrap;
          gap: 4px 12px;
          font-size: 10px;
          color: #555;
          margin-top: 4px;
        }
        .pbd-footer-ids {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 4px 12px;
          font-size: 10px;
          color: #555;
          margin-top: 8px;
        }
        .pbd-client {
          text-align: center;
          font-size: 13px;
          margin-bottom: 20px;
          min-height: 18px;
        }
        .pbd-title {
          font-size: 32px;
          font-weight: 300;
          color: #666;
          margin: 0 0 28px;
        }
        .pbd-meta {
          display: grid;
          gap: 12px;
          margin-bottom: 32px;
          font-size: 12px;
        }
        .pbd-meta-label {
          font-weight: 700;
          color: #111;
          margin-bottom: 2px;
        }
        .pbd-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          margin-bottom: 24px;
        }
        .pbd-table thead th {
          text-align: left;
          font-weight: 400;
          color: #444;
          border-bottom: 1px solid #ddd;
          padding: 8px 6px;
        }
        .pbd-table .pbd-col-qte,
        .pbd-table .pbd-col-pu,
        .pbd-table .pbd-col-mt {
          text-align: right;
        }
        .pbd-table tbody td {
          padding: 10px 6px;
          vertical-align: top;
          border-bottom: 1px solid #f2f2f2;
        }
        .pbd-table .pbd-col-qte,
        .pbd-table .pbd-col-pu,
        .pbd-table .pbd-col-mt {
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }
        .pbd-subdesc {
          color: #666;
          font-size: 11px;
          margin-top: 2px;
        }
        .pbd-totals {
          display: flex;
          justify-content: flex-end;
          margin-top: 12px;
        }
        .pbd-totals-box {
          width: 55%;
          font-size: 12px;
        }
        .pbd-total-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 6px 6px;
          border-bottom: 1px solid #f0f0f0;
        }
        .pbd-num {
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }
        /* Le total est le chiffre que le client lit : noir, gras (il était gris
           clair à 2,8:1). */
        .pbd-total-grand {
          color: #111;
          font-size: 14px;
          font-weight: 700;
          border-top: 1px solid #ddd;
          border-bottom: none;
          padding-top: 10px;
          font-variant-numeric: tabular-nums;
        }
        .pbd-footer {
          position: absolute;
          bottom: 24px;
          left: 40px;
          right: 40px;
          display: flex;
          justify-content: space-between;
          gap: 16px;
          font-size: 10px;
          color: #555;
          border-top: 1px solid #eee;
          padding-top: 10px;
        }
        @media print {
          @page A4 { size: A4; margin: 0; }
          html, body { background: #fff !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          body * { visibility: hidden !important; }
          .pbd-print-doc, .pbd-print-doc * { visibility: visible !important; }
          .pbd-print-doc {
            position: absolute !important;
            left: 0; top: 0; right: 0;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print\\:hidden { display: none !important; }
          .pbd-print-page { box-shadow: none !important; min-height: 100vh; }
        }
      `}</style>
    </div>
  );
}
