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
    const pageWidth = doc.page.width - 80;

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

  async generateInvoicePDF(factureId: number): Promise<Buffer> {
    const settings = await getSettings();
    const { rows } = await pool.query(
      `SELECT f.*, t.raison_sociale as client_nom, t.adresse as client_adresse, t.telephone as client_telephone
       FROM factures f LEFT JOIN tiers t ON f.client_id = t.id WHERE f.id = $1 AND f.deleted_at IS NULL`,
      [factureId]
    );
    if (!rows[0]) throw new Error('Facture introuvable');
    const facture = rows[0];

    const { rows: lignes } = await pool.query(
      `SELECT fl.*, p.nom as produit_nom, p.reference as produit_reference
       FROM facture_lignes fl LEFT JOIN produits p ON fl.produit_id = p.id WHERE fl.facture_id = $1`,
      [factureId]
    );

    return this.buildDocumentPDF(facture, lignes, 'FACTURE', facture.numero_facture || facture.numero);
  }

  async generateDevisPDF(devisId: number): Promise<Buffer> {
    const settings = await getSettings();
    const { rows } = await pool.query(
      `SELECT d.*, t.raison_sociale as client_nom, t.adresse as client_adresse, t.telephone as client_telephone
       FROM devis d LEFT JOIN tiers t ON d.client_id = t.id WHERE d.id = $1 AND d.deleted_at IS NULL`,
      [devisId]
    );
    if (!rows[0]) throw new Error('Devis introuvable');
    const doc = rows[0];

    const { rows: lignes } = await pool.query(
      `SELECT dl.*, p.nom as produit_nom, p.reference as produit_reference
       FROM devis_lignes dl LEFT JOIN produits p ON dl.produit_id = p.id WHERE dl.devis_id = $1`,
      [devisId]
    );

    return this.buildDocumentPDF(doc, lignes, 'DEVIS', doc.numero_devis || doc.numero);
  }

  async generateBLPDF(blId: number): Promise<Buffer> {
    const settings = await getSettings();
    const { rows } = await pool.query(
      `SELECT bl.*, t.raison_sociale as client_nom, t.adresse as client_adresse, t.telephone as client_telephone
       FROM bons_livraison bl LEFT JOIN tiers t ON bl.client_id = t.id WHERE bl.id = $1 AND bl.deleted_at IS NULL`,
      [blId]
    );
    if (!rows[0]) throw new Error('Bon de livraison introuvable');
    const doc = rows[0];

    const { rows: lignes } = await pool.query(
      `SELECT bll.*, p.nom as produit_nom, p.reference as produit_reference
       FROM bon_livraison_lignes bll LEFT JOIN produits p ON bll.produit_id = p.id WHERE bll.bon_livraison_id = $1`,
      [blId]
    );

    return this.buildDocumentPDF(doc, lignes, 'BON DE LIVRAISON', doc.numero_bl || doc.numero);
  }

  async generateAvoirPDF(avoirId: number): Promise<Buffer> {
    const settings = await getSettings();
    const { rows } = await pool.query(
      `SELECT a.*, t.raison_sociale as client_nom, t.adresse as client_adresse
       FROM avoirs a LEFT JOIN tiers t ON a.client_id = t.id WHERE a.id = $1 AND a.deleted_at IS NULL`,
      [avoirId]
    );
    if (!rows[0]) throw new Error('Avoir introuvable');
    const doc = rows[0];

    const { rows: lignes } = await pool.query(
      `SELECT al.*, p.nom as produit_nom
       FROM avoir_lignes al LEFT JOIN produits p ON al.produit_id = p.id WHERE al.avoir_id = $1`,
      [avoirId]
    );

    return this.buildDocumentPDF(doc, lignes, 'AVOIR', doc.numero_avoir || doc.numero);
  }

  private async buildDocumentPDF(
    header: any,
    lignes: any[],
    title: string,
    numero: string
  ): Promise<Buffer> {
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

      // Client info
      if (header.client_nom) {
        doc.fontSize(9).font('Helvetica');
        doc.text(`Client: ${header.client_nom}`, { continued: false });
        if (header.client_adresse) doc.text(`Adresse: ${header.client_adresse}`);
        if (header.client_telephone) doc.text(`Tel: ${header.client_telephone}`);
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
