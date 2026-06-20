import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import pool from '../db/connection';
import multer from 'multer';
import XLSX from 'xlsx';

const router = Router();
router.use(authenticate);
router.use(authorize(['admin', 'manager']));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ========== IMPORT PRODUITS ==========
router.post('/produits', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'Fichier requis' });
      return;
    }
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    if (rows.length === 0) {
      res.status(400).json({ success: false, error: 'Fichier vide' });
      return;
    }

    const results = { imported: 0, errors: 0, details: [] as string[] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const nom = row['Nom'] || row['nom'] || row['PRODUIT'] || row['produit'] || '';
        const reference = row['Référence'] || row['reference'] || row['REFERENCE'] || row['REF'] || row['ref'] || `IMP-${Date.now()}-${i}`;
        const prix_vente = parseFloat(row['Prix vente'] || row['prix_vente'] || row['Prix'] || row['prix'] || 0);
        const prix_achat = parseFloat(row['Prix achat'] || row['prix_achat'] || row['Cout'] || row['cout'] || 0);
        const stock = parseInt(row['Stock'] || row['stock'] || row['STOCK'] || 0);
        const stock_min = parseInt(row['Stock min'] || row['stock_min'] || row['SEUIL'] || row['seuil'] || 0);

        if (!nom) {
          results.errors++;
          results.details.push(`Ligne ${i + 2}: Nom manquant`);
          continue;
        }

        await pool.query(
          `INSERT INTO produits (nom, reference, prix_vente, prix_achat, stock, stock_min)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (reference) DO UPDATE SET
             nom = EXCLUDED.nom, prix_vente = EXCLUDED.prix_vente,
             prix_achat = EXCLUDED.prix_achat, stock = EXCLUDED.stock,
             stock_min = EXCLUDED.stock_min`,
          [nom, reference, prix_vente, prix_achat, stock, stock_min]
        );
        results.imported++;
      } catch (err: any) {
        results.errors++;
        results.details.push(`Ligne ${i + 2}: ${err.message}`);
      }
    }

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Import produits error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de l\'import' });
  }
});

// ========== IMPORT TIERS ==========
router.post('/tiers', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'Fichier requis' });
      return;
    }
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    if (rows.length === 0) {
      res.status(400).json({ success: false, error: 'Fichier vide' });
      return;
    }

    const results = { imported: 0, errors: 0, details: [] as string[] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const raison_sociale = row['Raison sociale'] || row['raison_sociale'] || row['Nom'] || row['nom'] || row['CLIENT'] || row['client'] || '';
        const telephone = row['Téléphone'] || row['telephone'] || row['TEL'] || row['tel'] || '';
        const email = row['Email'] || row['email'] || '';
        const type = row['Type'] || row['type'] || 'client';

        if (!raison_sociale) {
          results.errors++;
          results.details.push(`Ligne ${i + 2}: Raison sociale manquante`);
          continue;
        }

        const isClient = type === 'client' || type === 'client_fournisseur';
        const isFournisseur = type === 'fournisseur' || type === 'client_fournisseur';

        await pool.query(
          `INSERT INTO tiers (raison_sociale, telephone, email, est_client, est_fournisseur)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [raison_sociale, telephone || null, email || null, isClient, isFournisseur]
        );
        results.imported++;
      } catch (err: any) {
        results.errors++;
        results.details.push(`Ligne ${i + 2}: ${err.message}`);
      }
    }

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Import tiers error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de l\'import' });
  }
});

// ========== TEMPLATE DOWNLOAD ==========
router.get('/template/:type', async (req: Request, res: Response) => {
  try {
    const type = req.params.type;
    let workbook: XLSX.WorkBook;

    if (type === 'produits') {
      const data = [
        { 'Nom': 'Exemple Produit', 'Référence': 'REF-001', 'Prix vente': 15000, 'Prix achat': 10000, 'Stock': 10, 'Stock min': 2 }
      ];
      workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(workbook, sheet, 'Produits');
    } else if (type === 'tiers') {
      const data = [
        { 'Raison sociale': 'Exemple Client', 'Téléphone': '+225 01 02 03 04', 'Email': 'client@example.com', 'Type': 'client' }
      ];
      workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(workbook, sheet, 'Tiers');
    } else {
      res.status(400).json({ success: false, error: 'Type de template invalide' });
      return;
    }

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="template-${type}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    console.error('Template download error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

export default router;
