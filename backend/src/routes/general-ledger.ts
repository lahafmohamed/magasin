import { Router } from 'express';
import { GeneralLedgerController } from '../controllers/GeneralLedgerController';
import { authenticate, authorize } from '../middleware/auth';
import { GeneralLedgerService } from '../services/GeneralLedgerService';
import { PDFService } from '../services/PDFService';

const router = Router();

// All routes require authentication and manager/admin role
router.use(authenticate);
router.use(authorize('admin', 'manager'));

router.get('/', GeneralLedgerController.getAll);
router.get('/chart-of-accounts', GeneralLedgerController.getChartOfAccounts);
router.get('/trial-balance', GeneralLedgerController.getTrialBalance);
router.get('/account/:id/ledger', GeneralLedgerController.getAccountLedger);
router.get('/document/:pieceType/:pieceId', GeneralLedgerController.getByDocument);
router.post('/manual-entry', GeneralLedgerController.createManualEntry);
router.get('/stats', GeneralLedgerController.getStats);
router.get('/journal-breakdown', GeneralLedgerController.getJournalBreakdown);

// Export all entries (no pagination)
router.get('/export', async (req, res) => {
  try {
    const { journal, date_debut, date_fin, compte_id } = req.query;
    const service = new GeneralLedgerService();
    const result = await service.getAll({
      journal: journal as string,
      date_debut: date_debut as string,
      date_fin: date_fin as string,
      compte_id: compte_id ? parseInt(compte_id as string) : undefined,
      page: 1,
      limit: 100000,
    });
    res.json({ success: true, data: result.data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export PDF
router.get('/export-pdf', async (req, res) => {
  try {
    const { journal, date_debut, date_fin, compte_id, type } = req.query;
    const exportType = (type as string) || 'ecritures';
    const service = new GeneralLedgerService();
    let data: any[] = [];
    let title = '';
    const dateDebut = date_debut as string | undefined;
    const dateFin = date_fin as string | undefined;

    if (exportType === 'ecritures') {
      const result = await service.getAll({
        journal: journal as string,
        date_debut: dateDebut,
        date_fin: dateFin,
        compte_id: compte_id ? parseInt(compte_id as string) : undefined,
        page: 1,
        limit: 100000,
      });
      data = result.data;
      title = 'Grand livre - Écritures comptables';
    } else if (exportType === 'chart') {
      data = await service.getChartOfAccounts();
      title = 'Plan comptable';
    } else if (exportType === 'balance') {
      if (!dateDebut || !dateFin) {
        res.status(400).json({ success: false, error: 'date_debut et date_fin requis' });
        return;
      }
      data = await service.getTrialBalance(dateDebut, dateFin);
      title = 'Balance comptable';
    }

    const doc = PDFService.generateLedgerPDF(data, exportType as any, title, dateDebut, dateFin);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${title.replace(/\s/g, '_')}.pdf"`);
    doc.pipe(res);
    doc.end();
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Compte de résultat (income statement) PDF
router.get('/income-statement/export-pdf', async (req, res) => {
  try {
    const { date_debut, date_fin } = req.query;
    if (!date_debut || !date_fin) {
      res.status(400).json({ success: false, error: 'date_debut et date_fin requis' });
      return;
    }
    const buffer = await PDFService.generateIncomeStatementPDF(date_debut as string, date_fin as string);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="compte_de_resultat.pdf"');
    res.send(buffer);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bilan (balance sheet) PDF
router.get('/balance-sheet/export-pdf', async (req, res) => {
  try {
    const { date_fin } = req.query;
    if (!date_fin) {
      res.status(400).json({ success: false, error: 'date_fin requis' });
      return;
    }
    const buffer = await PDFService.generateBalanceSheetPDF(date_fin as string);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="bilan.pdf"');
    res.send(buffer);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
