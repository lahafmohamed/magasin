import PDFDocument from 'pdfkit';
import pool from '../db/connection';

interface LedgerRow {
  numero_piece?: string;
  date_ecriture?: string;
  journal?: string;
  compte_numero?: string;
  compte_intitule?: string;
  description?: string;
  debit?: string | number;
  credit?: string | number;
}

interface ChartRow {
  numero: string;
  intitule: string;
  type_compte: string;
  categorie?: string;
  actif: boolean;
}

interface BalanceRow {
  compte_numero: string;
  compte_intitule: string;
  total_debit: string;
  total_credit: string;
  solde: string;
}

async function getSettings() {
  const { rows } = await pool.query(
    'SELECT devise, taux_conversion, nom, adresse, telephone, nif, rc, ai, cb, logo_url FROM company_settings WHERE id = 1'
  );
  return rows[0] || { devise: 'FCFA', taux_conversion: 1, nom: '' };
}

export class PDFService {
  static generateLedgerPDF(
    data: LedgerRow[] | ChartRow[] | BalanceRow[],
    type: 'ecritures' | 'chart' | 'balance',
    title: string,
    dateDebut?: string,
    dateFin?: string
  ): PDFKit.PDFDocument {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    doc.fontSize(16).font('Helvetica-Bold').text(title, { align: 'center' });
    doc.moveDown(0.5);
    if (dateDebut && dateFin) {
      doc.fontSize(10).font('Helvetica').text(`Période: ${dateDebut} au ${dateFin}`, { align: 'center' });
    }
    doc.moveDown(1);

    const columns = type === 'ecritures'
      ? ['N° pièce', 'Date', 'Journal', 'Compte', 'Description', 'Débit', 'Crédit']
      : type === 'chart'
      ? ['N°', 'Intitulé', 'Type', 'Catégorie', 'Statut']
      : ['N°', 'Compte', 'Total Débit', 'Total Crédit', 'Solde'];

    const colWidths = type === 'ecritures'
      ? [60, 50, 50, 40, 80, 50, 50]
      : type === 'chart'
      ? [40, 100, 60, 60, 50]
      : [40, 100, 60, 60, 50];

    const totalColWidth = colWidths.reduce((a, b) => a + b, 0);
    const startX = 40;

    let y = doc.y;
    doc.fontSize(8).font('Helvetica-Bold');
    doc.rect(startX, y, totalColWidth, 18).fill('#f0f0f0');
    doc.fill('#111');
    let x = startX;
    columns.forEach((col, i) => {
      doc.text(col, x + 2, y + 4, { width: colWidths[i], align: 'left' });
      x += colWidths[i];
    });
    doc.moveDown(1.5);

    doc.font('Helvetica').fontSize(7);
    (data as any[]).forEach((row, index) => {
      y = doc.y;
      if (y > 750) {
        doc.addPage();
        y = doc.y;
      }

      const values = type === 'ecritures'
        ? [(row as LedgerRow).numero_piece || '',
           (row as LedgerRow).date_ecriture ? new Date((row as LedgerRow).date_ecriture!).toLocaleDateString('fr-FR') : '',
           (row as LedgerRow).journal || '',
           `${(row as LedgerRow).compte_numero || ''} ${(row as LedgerRow).compte_intitule || ''}`.trim(),
           (row as LedgerRow).description || '',
           (row as LedgerRow).debit ? Number((row as LedgerRow).debit).toFixed(0) : '',
           (row as LedgerRow).credit ? Number((row as LedgerRow).credit).toFixed(0) : '']
        : type === 'chart'
        ? [(row as ChartRow).numero, (row as ChartRow).intitule, (row as ChartRow).type_compte, (row as ChartRow).categorie || '', (row as ChartRow).actif ? 'Actif' : 'Inactif']
        : [(row as BalanceRow).compte_numero, (row as BalanceRow).compte_intitule,
           Number((row as BalanceRow).total_debit).toFixed(0), Number((row as BalanceRow).total_credit).toFixed(0),
           Number((row as BalanceRow).solde).toFixed(0)];

      if (index % 2 === 0) {
        doc.rect(startX, y, totalColWidth, 14).fill('#fafafa');
        doc.fill('#111');
      }
      x = startX;
      values.forEach((val, i) => {
        doc.text(String(val || '-'), x + 2, y + 3, { width: colWidths[i], align: 'left' });
        x += colWidths[i];
      });
      doc.y = y + 14;
    });

    doc.fontSize(8).text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' });
    return doc;
  }

  /**
   * Lignes d'un document de vente.
   *
   * Les quatre documents (facture / devis / BL / avoir) partagent la table
   * unifiée `document_lignes` (043_unified_tiers) discriminée par
   * `document_type`. Les anciennes tables par document (`facture_lignes`,
   * `avoir_lignes`) n'existent plus, et `devis_lignes` /
   * `bon_livraison_lignes` survivent vides — les interroger produisait soit une
   * erreur SQL, soit un PDF sans aucune ligne et un total à 0.
   */
  private async getDocumentLignes(
    documentType: 'facture' | 'devis' | 'bl' | 'avoir',
    documentId: number
  ): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT dl.*, p.nom AS produit_nom, p.reference AS produit_reference
       FROM document_lignes dl
       LEFT JOIN produits p ON dl.produit_id = p.id
       WHERE dl.document_type = $1 AND dl.document_id = $2
       ORDER BY dl.id`,
      [documentType, documentId]
    );
    return rows;
  }

  async generateInvoicePDF(factureId: number): Promise<Buffer> {
    const { rows } = await pool.query(
      `SELECT f.*, t.raison_sociale as client_nom, t.adresse as client_adresse, t.telephone as client_telephone
       FROM factures f LEFT JOIN tiers t ON f.tiers_id = t.id WHERE f.id = $1 AND f.deleted_at IS NULL`,
      [factureId]
    );
    if (!rows[0]) throw new Error('Facture introuvable');
    const facture = rows[0];

    const lignes = await this.getDocumentLignes('facture', factureId);

    return this.buildDocumentPDF(facture, lignes, 'FACTURE', facture.numero_facture || facture.numero);
  }

  async generateDevisPDF(devisId: number): Promise<Buffer> {
    const { rows } = await pool.query(
      `SELECT d.*, t.raison_sociale as client_nom, t.adresse as client_adresse, t.telephone as client_telephone
       FROM devis d LEFT JOIN tiers t ON d.tiers_id = t.id WHERE d.id = $1 AND d.deleted_at IS NULL`,
      [devisId]
    );
    if (!rows[0]) throw new Error('Devis introuvable');
    const doc = rows[0];

    const lignes = await this.getDocumentLignes('devis', devisId);

    return this.buildDocumentPDF(doc, lignes, 'DEVIS', doc.numero_devis || doc.numero);
  }

  async generateBLPDF(blId: number): Promise<Buffer> {
    const { rows } = await pool.query(
      `SELECT bl.*, t.raison_sociale as client_nom, t.adresse as client_adresse, t.telephone as client_telephone
       FROM bons_livraison bl LEFT JOIN tiers t ON bl.tiers_id = t.id WHERE bl.id = $1 AND bl.deleted_at IS NULL`,
      [blId]
    );
    if (!rows[0]) throw new Error('Bon de livraison introuvable');
    const doc = rows[0];

    const lignes = await this.getDocumentLignes('bl', blId);

    return this.buildDocumentPDF(doc, lignes, 'BON DE LIVRAISON', doc.numero_bl || doc.numero);
  }

  async generateAvoirPDF(avoirId: number): Promise<Buffer> {
    const { rows } = await pool.query(
      `SELECT a.*, t.raison_sociale as client_nom, t.adresse as client_adresse, t.telephone as client_telephone
       FROM factures_avoir a LEFT JOIN tiers t ON a.tiers_id = t.id
       WHERE a.id = $1 AND a.deleted_at IS NULL`,
      [avoirId]
    );
    if (!rows[0]) throw new Error('Avoir introuvable');
    const doc = rows[0];

    const lignes = await this.getDocumentLignes('avoir', avoirId);

    return this.buildDocumentPDF(doc, lignes, 'AVOIR', doc.numero_avoir || doc.numero);
  }

  /**
   * Bon de commande fournisseur — le seul document que l'on **envoie** à un
   * fournisseur. Réutilise le gabarit document standard, avec l'en-tête tiers
   * libellé « Fournisseur » et le rappel de la date de livraison prévue.
   */
  async generateCommandePDF(commandeId: number): Promise<Buffer> {
    const { rows } = await pool.query(
      `SELECT c.*, t.raison_sociale AS client_nom, t.adresse AS client_adresse, t.telephone AS client_telephone
       FROM commandes_fournisseur c LEFT JOIN tiers t ON c.tiers_id = t.id
       WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [commandeId]
    );
    if (!rows[0]) throw new Error('Commande introuvable');
    const cmd = rows[0];

    const { rows: lignes } = await pool.query(
      `SELECT cl.*, p.nom AS produit_nom, p.reference AS produit_reference
       FROM commande_lignes cl LEFT JOIN produits p ON cl.produit_id = p.id
       WHERE cl.commande_id = $1 ORDER BY cl.id`,
      [commandeId]
    );

    const STATUT_LABELS: Record<string, string> = {
      en_attente: 'En attente', validee: 'Validée', expediee: 'Expédiée',
      livree: 'Livrée', annulee: 'Annulée',
    };
    const extraInfo: string[] = [
      `Date de commande: ${new Date(cmd.date_commande).toLocaleDateString('fr-FR')}`,
    ];
    if (cmd.date_livraison_prevue) {
      extraInfo.push(
        `Livraison prévue: ${new Date(cmd.date_livraison_prevue).toLocaleDateString('fr-FR')}`
      );
    }
    extraInfo.push(`Statut: ${STATUT_LABELS[cmd.statut] || cmd.statut}`);
    if (cmd.notes) extraInfo.push(`Notes: ${cmd.notes}`);

    return this.buildDocumentPDF(cmd, lignes, 'BON DE COMMANDE', cmd.numero_commande, {
      counterpartyLabel: 'Fournisseur',
      extraInfo,
    });
  }

  /**
   * Reçu de paiement (quittance) — remis au client qui règle une facture.
   * Format compact : un encadré montant + le rappel du solde restant dû.
   */
  async generatePaiementRecuPDF(paiementId: number): Promise<Buffer> {
    const settings = await getSettings();
    const devise = settings.devise || 'FCFA';

    const { rows } = await pool.query(
      `SELECT p.id, p.montant, p.methode_paiement, p.date_paiement, p.reference, p.notes,
              f.numero_facture, f.total AS facture_total, f.montant_paye, f.remaining_due,
              t.raison_sociale AS client_nom, t.adresse AS client_adresse, t.telephone AS client_telephone,
              u.nom_complet AS encaisse_par, u.username AS encaisse_par_username
       FROM paiements p
       JOIN factures f ON f.id = p.facture_id
       LEFT JOIN tiers t ON t.id = f.tiers_id
       LEFT JOIN utilisateurs u ON u.id = p.cree_par
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [paiementId]
    );
    if (!rows[0]) throw new Error('Paiement introuvable');
    const pay = rows[0];

    const METHODE_LABELS: Record<string, string> = {
      espece: 'Espèces', carte: 'Carte bancaire', cheque: 'Chèque', virement: 'Virement',
      mobile_money: 'Mobile Money', orange_money: 'Orange Money', mtn_money: 'MTN Money', wave: 'Wave',
    };
    const fmt = (v: any) => Number(v || 0).toLocaleString('fr-FR');

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(16).font('Helvetica-Bold').text(settings.nom || 'Hitek-CI', { align: 'center' });
      doc.fontSize(9).font('Helvetica');
      if (settings.adresse) doc.text(settings.adresse, { align: 'center' });
      if (settings.telephone) doc.text(`Tel: ${settings.telephone}`, { align: 'center' });
      if (settings.nif) {
        doc.fontSize(7).text(`NIF: ${settings.nif} | RC: ${settings.rc || '-'}`, { align: 'center' });
      }
      doc.moveDown(1.5);

      doc.fontSize(14).font('Helvetica-Bold').text('REÇU DE PAIEMENT', { align: 'center' });
      doc.fontSize(9).font('Helvetica').text(`N° ${pay.id}`, { align: 'center' });
      doc.moveDown(1.5);

      doc.fontSize(10).font('Helvetica');
      doc.text(`Reçu de: ${pay.client_nom || '-'}`);
      if (pay.client_adresse) doc.text(`Adresse: ${pay.client_adresse}`);
      if (pay.client_telephone) doc.text(`Tel: ${pay.client_telephone}`);
      doc.moveDown(1);

      // Encadré montant
      const boxX = 40;
      const boxW = 515;
      let y = doc.y;
      doc.rect(boxX, y, boxW, 44).fill('#f0f0f0');
      doc.fillColor('#111').fontSize(11).font('Helvetica-Bold');
      doc.text('MONTANT REÇU', boxX + 12, y + 8, { width: boxW - 24 });
      doc.fontSize(18);
      doc.text(`${fmt(pay.montant)} ${devise}`, boxX + 12, y + 22, { width: boxW - 24, align: 'right' });
      doc.y = y + 54;

      // Détail
      const rowH = 18;
      const labelW = 200;
      const drawRow = (label: string, value: string, opts?: { bold?: boolean; fill?: string }) => {
        const ry = doc.y;
        if (opts?.fill) { doc.rect(boxX, ry, boxW, rowH).fill(opts.fill); doc.fillColor('#111'); }
        doc.fontSize(9).font(opts?.bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#111');
        doc.text(label, boxX + 6, ry + 5, { width: labelW });
        doc.text(value, boxX + labelW, ry + 5, { width: boxW - labelW - 12, align: 'right' });
        doc.y = ry + rowH;
      };

      drawRow('Détail du règlement', '', { bold: true, fill: '#f0f0f0' });
      drawRow('Facture réglée', pay.numero_facture || '-');
      drawRow('Date du paiement', new Date(pay.date_paiement).toLocaleDateString('fr-FR'), { fill: '#fafafa' });
      drawRow('Mode de paiement', METHODE_LABELS[pay.methode_paiement] || pay.methode_paiement);
      if (pay.reference) drawRow('Référence', pay.reference, { fill: '#fafafa' });
      drawRow('Total de la facture', `${fmt(pay.facture_total)} ${devise}`);
      drawRow('Total réglé à ce jour', `${fmt(pay.montant_paye)} ${devise}`, { fill: '#fafafa' });
      drawRow('RESTE À PAYER', `${fmt(pay.remaining_due)} ${devise}`, { bold: true, fill: '#e8f0e8' });

      if (pay.notes) {
        doc.moveDown(1);
        doc.fontSize(9).font('Helvetica').fillColor('#111').text(`Notes: ${pay.notes}`);
      }

      doc.moveDown(2);
      doc.fontSize(9).font('Helvetica').fillColor('#111');
      doc.text(`Encaissé par: ${pay.encaisse_par || pay.encaisse_par_username || '-'}`);

      doc.moveDown(3);
      doc.fontSize(9).text('Signature et cachet', 380, doc.y, { width: 175, align: 'center' });
      doc.moveTo(380, doc.y + 34).lineTo(555, doc.y + 34).stroke('#999');

      doc.fontSize(7).font('Helvetica').fillColor('#666');
      doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 40, 780, { align: 'center' });
      doc.end();
    });
  }

  /** Bulletin de paie (payslip) PDF for a single payslip. */
  async generatePayslipPDF(payslipId: number): Promise<Buffer> {
    const settings = await getSettings();
    const devise = settings.devise || 'FCFA';
    const { rows } = await pool.query(
      `SELECT s.*, e.nom_complet, e.matricule, e.poste,
              r.numero AS run_numero, r.periode
       FROM payslips s
       JOIN employes e ON e.id = s.employe_id
       JOIN payroll_runs r ON r.id = s.payroll_run_id
       WHERE s.id = $1`,
      [payslipId]
    );
    if (!rows[0]) throw new Error('Bulletin introuvable');
    const ps = rows[0];
    const fmt = (v: any) => Number(v || 0).toLocaleString('fr-FR');

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Company header
      doc.fontSize(16).font('Helvetica-Bold').text(settings.nom || 'Hitek-CI', { align: 'center' });
      doc.fontSize(9).font('Helvetica');
      if (settings.adresse) doc.text(settings.adresse, { align: 'center' });
      if (settings.telephone) doc.text(`Tel: ${settings.telephone}`, { align: 'center' });
      doc.moveDown(1);

      doc.fontSize(14).font('Helvetica-Bold').text('BULLETIN DE PAIE', { align: 'center' });
      doc.fontSize(10).font('Helvetica').text(`Période: ${ps.periode}  -  Cycle: ${ps.run_numero}`, { align: 'center' });
      doc.moveDown(1);

      // Employee block
      doc.fontSize(9).font('Helvetica');
      doc.text(`Employé: ${ps.nom_complet}`);
      if (ps.matricule) doc.text(`Matricule: ${ps.matricule}`);
      if (ps.poste) doc.text(`Poste: ${ps.poste}`);
      doc.moveDown(1);

      // Detail table
      const startX = 40;
      const labelW = 360;
      const amountW = 115;
      const rowH = 16;
      const drawRow = (label: string, amount: string, opts?: { bold?: boolean; fill?: string }) => {
        let y = doc.y;
        if (y > 740) { doc.addPage(); y = doc.y; }
        if (opts?.fill) { doc.rect(startX, y, labelW + amountW, rowH).fill(opts.fill); doc.fill('#111'); }
        doc.font(opts?.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#111');
        doc.text(label, startX + 4, y + 4, { width: labelW - 8, align: 'left' });
        doc.text(amount, startX + labelW, y + 4, { width: amountW - 4, align: 'right' });
        doc.y = y + rowH;
      };

      drawRow('Désignation', `Montant (${devise})`, { bold: true, fill: '#f0f0f0' });
      drawRow('Salaire de base', fmt(ps.salaire_base));
      drawRow('Commissions', fmt(ps.commissions), { fill: '#fafafa' });
      drawRow('Primes', fmt(ps.primes));
      drawRow('Salaire brut', fmt(ps.salaire_brut), { bold: true, fill: '#f0f0f0' });
      drawRow('Retenue CNPS', `- ${fmt(ps.retenue_cnps)}`, { fill: '#fafafa' });
      drawRow('Retenue ITS', `- ${fmt(ps.retenue_its)}`);
      drawRow('Autres déductions', `- ${fmt(ps.deductions)}`, { fill: '#fafafa' });
      drawRow('NET À PAYER', `${fmt(ps.salaire_net)} ${devise}`, { bold: true, fill: '#e8f0e8' });
      if (Number(ps.cotisations_patronales) > 0) {
        drawRow('Charges patronales (employeur)', fmt(ps.cotisations_patronales));
      }

      doc.moveDown(1.5);
      doc.fontSize(9).font('Helvetica').fillColor('#111');
      const statutLabel = ps.statut === 'paye' ? 'Payé' : 'En attente';
      doc.text(`Statut: ${statutLabel}`);
      if (ps.methode_paiement) doc.text(`Méthode de paiement: ${ps.methode_paiement}`);
      if (ps.date_paiement) doc.text(`Date de paiement: ${new Date(ps.date_paiement).toLocaleDateString('fr-FR')}`);

      doc.moveDown(2);
      doc.fontSize(7).font('Helvetica').fillColor('#666');
      doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' });
      doc.end();
    });
  }

  /** Two-column financial-statement PDF (bilan / compte de résultat). */
  private static buildStatementPDF(
    settings: any,
    title: string,
    leftTitle: string,
    leftRows: Array<{ compte_numero: string; compte_intitule: string; montant: number }>,
    leftTotal: number,
    rightTitle: string,
    rightRows: Array<{ compte_numero: string; compte_intitule: string; montant: number }>,
    rightTotal: number,
    subtitle: string
  ): Promise<Buffer> {
    const devise = settings.devise || 'FCFA';
    const fmt = (v: number) => Number(v || 0).toLocaleString('fr-FR');

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(16).font('Helvetica-Bold').text(settings.nom || 'Hitek-CI', { align: 'center' });
      doc.fontSize(14).font('Helvetica-Bold').text(title, { align: 'center' });
      doc.fontSize(9).font('Helvetica').text(subtitle, { align: 'center' });
      doc.moveDown(1);

      const colW = 255;
      const leftX = 40;
      const rightX = 40 + colW + 10;
      const numW = 45;
      const amtW = 75;

      const renderColumn = (x: number, header: string, rows: typeof leftRows, total: number) => {
        let y = 120;
        doc.fontSize(10).font('Helvetica-Bold');
        doc.rect(x, y, colW, 18).fill('#f0f0f0'); doc.fill('#111');
        doc.text(header, x + 4, y + 5, { width: colW - 8 });
        y += 20;
        doc.fontSize(8).font('Helvetica');
        rows.forEach((r, i) => {
          if (y > 760) { doc.addPage(); y = 40; }
          if (i % 2 === 0) { doc.rect(x, y, colW, 13).fill('#fafafa'); doc.fill('#111'); }
          doc.text(r.compte_numero, x + 2, y + 2, { width: numW });
          doc.text(r.compte_intitule, x + numW + 2, y + 2, { width: colW - numW - amtW - 4, align: 'left' });
          doc.text(fmt(r.montant), x + colW - amtW, y + 2, { width: amtW - 2, align: 'right' });
          y = y + 13;
        });
        doc.fontSize(9).font('Helvetica-Bold');
        doc.rect(x, y, colW, 16).fill('#e8e8e8'); doc.fill('#111');
        doc.text('TOTAL', x + 4, y + 3, { width: colW - amtW - 6 });
        doc.text(`${fmt(total)} ${devise}`, x + colW - amtW - 30, y + 3, { width: amtW + 26, align: 'right' });
      };

      renderColumn(leftX, leftTitle, leftRows, leftTotal);
      renderColumn(rightX, rightTitle, rightRows, rightTotal);

      doc.y = 40;
      doc.fontSize(7).font('Helvetica').fillColor('#666');
      doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 40, 800, { align: 'center' });
      doc.end();
    });
  }

  static async generateIncomeStatementPDF(dateDebut: string, dateFin: string): Promise<Buffer> {
    const settings = await getSettings();
    const { generalLedgerService } = await import('./GeneralLedgerService');
    const r = await generalLedgerService.getIncomeStatement(dateDebut, dateFin);
    const charges = [...r.charges, { compte_numero: '', compte_intitule: 'Résultat (bénéfice)', montant: r.resultat > 0 ? r.resultat : 0 }];
    const produits = [...r.produits, { compte_numero: '', compte_intitule: 'Résultat (perte)', montant: r.resultat < 0 ? -r.resultat : 0 }];
    return this.buildStatementPDF(
      settings, 'COMPTE DE RÉSULTAT',
      'Charges', charges, r.total_charges + (r.resultat > 0 ? r.resultat : 0),
      'Produits', produits, r.total_produits + (r.resultat < 0 ? -r.resultat : 0),
      `Période: ${dateDebut} au ${dateFin}`
    );
  }

  static async generateBalanceSheetPDF(dateFin: string): Promise<Buffer> {
    const settings = await getSettings();
    const { generalLedgerService } = await import('./GeneralLedgerService');
    const r = await generalLedgerService.getBalanceSheet(dateFin);
    const passif = [...r.passif, { compte_numero: '', compte_intitule: 'Résultat net de l\'exercice', montant: r.resultat }];
    return this.buildStatementPDF(
      settings, 'BILAN',
      'Actif', r.actif, r.total_actif,
      'Passif', passif, r.total_passif,
      `Arrêté au ${dateFin}`
    );
  }

  /** Relevé de compte client détaillé (lignes produits + versements + solde cumulé). */
  async generateRelevePDF(tiersId: number, from?: string, to?: string): Promise<Buffer> {
    const settings = await getSettings();
    const devise = settings.devise || 'FCFA';
    const { tiersService } = await import('./TiersService');
    const releve = await tiersService.getReleveDetaille(tiersId, { from, to });
    if (!releve) throw new Error('Tiers introuvable');
    const fmt = (v: any) => (v == null || v === '' ? '' : Number(v).toLocaleString('fr-FR'));

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(15).font('Helvetica-Bold').text(settings.nom || 'Hitek-CI', { align: 'center' });
      doc.fontSize(13).font('Helvetica-Bold').text('RELEVÉ DE COMPTE', { align: 'center' });
      doc.fontSize(10).font('Helvetica').text(`Client: ${releve.tiers.raison_sociale || ''}`, { align: 'center' });
      const periode = from || to ? `Période: ${from || '...'} au ${to || '...'}` : 'Toutes opérations';
      doc.fontSize(9).text(periode, { align: 'center' });
      doc.moveDown(0.8);

      const startX = 30;
      const cols = [
        { k: 'date', label: 'DATE', w: 70, align: 'left' },
        { k: 'facture', label: 'FACTURE N°', w: 110, align: 'left' },
        { k: 'designation', label: 'DÉSIGNATION', w: 250, align: 'left' },
        { k: 'quantite', label: 'QTÉ', w: 50, align: 'right' },
        { k: 'prix_unitaire', label: 'PRIX UNIT.', w: 90, align: 'right' },
        { k: 'montant', label: 'MONTANT', w: 90, align: 'right' },
        { k: 'versement', label: 'VERSEMENT', w: 90, align: 'right' },
        { k: 'solde', label: 'SOLDE', w: 90, align: 'right' },
      ];
      const totalW = cols.reduce((a, c) => a + c.w, 0);

      const header = (y: number) => {
        doc.fontSize(8).font('Helvetica-Bold');
        doc.rect(startX, y, totalW, 16).fill('#222'); doc.fillColor('#fff');
        let x = startX;
        for (const c of cols) { doc.text(c.label, x + 3, y + 4, { width: c.w - 6, align: c.align as any }); x += c.w; }
        doc.fillColor('#111');
        return y + 16;
      };

      let y = header(doc.y);
      doc.font('Helvetica').fontSize(8);
      releve.lignes.forEach((l: any, i: number) => {
        if (y > 540) { doc.addPage(); y = header(40); doc.font('Helvetica').fontSize(8); }
        const isPay = l.versement > 0;
        if (isPay) { doc.rect(startX, y, totalW, 14).fill('#fde8e8'); doc.fillColor('#b91c1c'); }
        else if (i % 2 === 0) { doc.rect(startX, y, totalW, 14).fill('#fafafa'); doc.fillColor('#111'); }
        else doc.fillColor('#111');
        let x = startX;
        const vals: any = {
          date: l.date, facture: l.facture, designation: l.designation,
          quantite: fmt(l.quantite), prix_unitaire: fmt(l.prix_unitaire),
          montant: l.montant ? fmt(l.montant) : '', versement: l.versement ? fmt(l.versement) : '',
          solde: fmt(l.solde),
        };
        for (const c of cols) { doc.text(String(vals[c.k] ?? ''), x + 3, y + 3, { width: c.w - 6, align: c.align as any }); x += c.w; }
        doc.fillColor('#111');
        y += 14;
      });

      // Totaux
      y += 6;
      if (y > 540) { doc.addPage(); y = 40; }
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#111');
      doc.text(`Total facturé: ${fmt(releve.total_facture)} ${devise}    Total versé: ${fmt(releve.total_versement)} ${devise}    Solde dû: ${fmt(releve.solde_final)} ${devise}`,
        startX, y, { width: totalW, align: 'right' });

      doc.moveDown(1.5);
      doc.fontSize(7).font('Helvetica').fillColor('#666');
      doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' });
      doc.end();
    });
  }

  private async buildDocumentPDF(
    header: any,
    lignes: any[],
    title: string,
    numero: string,
    /**
     * `counterpartyLabel` : « Client » pour les documents de vente, « Fournisseur »
     * pour un bon de commande. `extraInfo` : lignes libres sous le bloc tiers.
     */
    options?: { counterpartyLabel?: string; extraInfo?: string[] }
  ): Promise<Buffer> {
    const counterpartyLabel = options?.counterpartyLabel || 'Client';
    const settings = await getSettings();
    const devise = settings.devise || 'FCFA';

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      let logoRendered = false;
      const logoUrl = settings.logo_url;
      if (logoUrl && logoUrl.startsWith('data:image/')) {
        try {
          const base64Data = logoUrl.split(';base64,').pop();
          if (base64Data) {
            const buffer = Buffer.from(base64Data, 'base64');
            doc.image(buffer, 40, 40, { fit: [120, 50] });
            logoRendered = true;
          }
        } catch (err) {
          console.error('Erreur lors du décodage du logo PDF:', err);
        }
      }

      if (logoRendered) {
        doc.fontSize(16).font('Helvetica-Bold').text(settings.nom || 'Hitek-CI', 200, 40, { align: 'right', width: 355 });
        doc.fontSize(9).font('Helvetica');
        let currentY = doc.y;
        if (settings.adresse) {
          doc.text(settings.adresse, 200, currentY, { align: 'right', width: 355 });
          currentY = doc.y;
        }
        if (settings.telephone) {
          doc.text(`Tel: ${settings.telephone}`, 200, currentY, { align: 'right', width: 355 });
          currentY = doc.y;
        }
        if (settings.nif) {
          doc.fontSize(7).text(`NIF: ${settings.nif} | RC: ${settings.rc || '-'} | AI: ${settings.ai || '-'}`, 200, currentY, { align: 'right', width: 355 });
        }
        doc.y = Math.max(doc.y, 100);
      } else {
        doc.fontSize(18).font('Helvetica-Bold').text(settings.nom || 'Hitek-CI', { align: 'center' });
        doc.fontSize(10).font('Helvetica');
        if (settings.adresse) doc.text(settings.adresse, { align: 'center' });
        if (settings.telephone) doc.text(`Tel: ${settings.telephone}`, { align: 'center' });
        if (settings.nif) doc.fontSize(8).text(`NIF: ${settings.nif} | RC: ${settings.rc || '-'} | AI: ${settings.ai || '-'}`, { align: 'center' });
      }
      doc.moveDown(1);

      // Title
      doc.fontSize(14).font('Helvetica-Bold').text(`${title} N° ${numero}`, { align: 'center' });
      doc.moveDown(0.5);

      // Bloc tiers (client ou fournisseur selon le document)
      if (header.client_nom) {
        doc.fontSize(9).font('Helvetica');
        doc.text(`${counterpartyLabel}: ${header.client_nom}`, { continued: false });
        if (header.client_adresse) doc.text(`Adresse: ${header.client_adresse}`);
        if (header.client_telephone) doc.text(`Tel: ${header.client_telephone}`);
        doc.moveDown(0.5);
      }

      if (options?.extraInfo?.length) {
        doc.fontSize(9).font('Helvetica');
        options.extraInfo.forEach((line) => doc.text(line));
        doc.moveDown(0.5);
      }

      // Table
      const tableTop = doc.y;
      const colWidths = [30, 200, 60, 70, 70, 70];
      const totalWidth = colWidths.reduce((a, b) => a + b, 0);

      doc.fontSize(8).font('Helvetica-Bold');
      let y = tableTop;
      doc.rect(40, y, totalWidth, 16).fill('#f0f0f0');
      doc.fill('#111');
      ['#', 'Produit', 'Qté', 'PU', 'Remise', 'Total'].forEach((col, i) => {
        const x = 40 + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.text(col, x + 2, y + 4, { width: colWidths[i], align: 'left' });
      });
      doc.y = y + 18;

      doc.font('Helvetica').fontSize(8);
      lignes.forEach((ligne, index) => {
        y = doc.y;
        if (y > 740) {
          doc.addPage();
          y = doc.y;
        }
        const values = [
          String(index + 1),
          ligne.produit_nom || ligne.description || '-',
          String(ligne.quantite_recue || ligne.quantite || 0),
          Number(ligne.cout_unitaire || ligne.prix_unitaire || 0).toLocaleString('fr-FR'),
          ligne.remise ? `${ligne.remise}%` : '-',
          Number(ligne.total_ligne || (ligne.quantite * ligne.prix_unitaire) || 0).toLocaleString('fr-FR'),
        ];
        if (index % 2 === 0) {
          doc.rect(40, y, totalWidth, 14).fill('#fafafa');
          doc.fill('#111');
        }
        let x = 40;
        values.forEach((val, i) => {
          doc.text(val, x + 2, y + 3, { width: colWidths[i], align: 'left' });
          x += colWidths[i];
        });
        doc.y = y + 14;
      });

      // Total
      doc.moveDown(1);
      const total = Array.isArray(lignes) ? lignes.reduce((sum, l) => {
        return sum + Number(l.total_ligne || (l.quantite * l.prix_unitaire) || 0);
      }, 0) : 0;
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text(`Total: ${total.toLocaleString('fr-FR')} ${devise}`, { align: 'right' });

      // Footer
      doc.moveDown(2);
      doc.fontSize(7).font('Helvetica').fillColor('#666');
      doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' });

      doc.end();
    });
  }
}

export const pdfService = new PDFService();
