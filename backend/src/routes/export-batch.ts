import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { pdfService } from '../services/PDFService';
import { ZipArchive } from 'archiver';

const router = Router();

router.use(authenticate);

/**
 * POST /api/export/batch
 * Exporte plusieurs documents au format ZIP contenant des PDFs individuels.
 * Body: { factures?: number[], devis?: number[], bons_livraison?: number[], commandes?: number[] }
 */
router.post('/batch', async (req: Request, res: Response) => {
  try {
    const { factures, devis, bons_livraison, commandes } = req.body;

    const ids: { type: string; id: number }[] = [];

    if (factures?.length) ids.push(...factures.map((id: number) => ({ type: 'facture', id })));
    if (devis?.length) ids.push(...devis.map((id: number) => ({ type: 'devis', id })));
    if (bons_livraison?.length) ids.push(...bons_livraison.map((id: number) => ({ type: 'bon_livraison', id })));

    if (ids.length === 0) {
      res.status(400).json({ success: false, error: 'Aucun document sélectionné' });
      return;
    }

    if (ids.length > 50) {
      res.status(400).json({ success: false, error: 'Maximum 50 documents par export' });
      return;
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="export-${Date.now()}.zip"`);

    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.pipe(res);

    for (const { type, id } of ids) {
      try {
        let pdfBuffer: Buffer;

        switch (type) {
          case 'facture':
            pdfBuffer = await pdfService.generateInvoicePDF(id);
            break;
          case 'devis':
            pdfBuffer = await pdfService.generateDevisPDF(id);
            break;
          case 'bon_livraison':
            pdfBuffer = await pdfService.generateBLPDF(id);
            break;
          default:
            continue;
        }

        const filename = `${type}-${id}-${Date.now()}.pdf`;
        archive.append(pdfBuffer, { name: filename });
      } catch (err) {
        console.error(`Error generating PDF for ${type} #${id}:`, err);
      }
    }

    await archive.finalize();
  } catch (error) {
    console.error('Batch export error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de l\'export batch' });
  }
});

export default router;
