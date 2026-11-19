import { Router } from 'express';
import { ProduitController } from '../controllers/ProduitController';
import { validateBody } from '../middleware/validation';
import { createProduitSchema, updateProduitSchema, adjustStockSchema, stockMovementSchema, genererCodesBarresSchema } from '../validation/schemas';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Magasin-only endpoints used by Ventes (Factures, Devis) — must precede `/:id`.
router.get('/ventes/locations', ProduitController.getVentesLocations);
router.get('/ventes', ProduitController.getAllVentes);

router.get('/search/fuzzy', ProduitController.searchFuzzy);
router.get('/suggestions', ProduitController.getSuggestions);

router.get('/', ProduitController.getAll);
router.get('/reorder-suggestions', ProduitController.getReorderSuggestions);
router.get('/stock-valuation', ProduitController.getStockValuation);
router.get('/stock-by-category', ProduitController.getStockByCategory);
router.get('/:id/info-achat', ProduitController.getPurchaseInfo);
router.get('/:id', ProduitController.getById);
router.get('/:id/mouvements', ProduitController.getStockHistory);
const canManageProduits = authorize('admin', 'manager', 'depot_staff');
// Creating a product sets its prices, which the dépôt does not see (quantities
// only, decision 2026-10-24): creation is for admin/manager; the dépôt can
// still edit a product's other fields (its price fields are ignored).
router.post('/', authorize('admin', 'manager'), validateBody(createProduitSchema), ProduitController.create);
// Lot 3 : EAN-13 internes pour les produits sans code-barres (gérant, admin).
router.post('/codes-barres', authorize('admin', 'manager'), validateBody(genererCodesBarresSchema), ProduitController.genererCodesBarres);
router.put('/:id', canManageProduits, validateBody(updateProduitSchema), ProduitController.update);
router.delete('/:id', authorize('admin', 'manager'), ProduitController.delete);
router.patch('/:id/stock', canManageProduits, validateBody(adjustStockSchema), ProduitController.adjustStock);
router.post('/:id/mouvements', canManageProduits, validateBody(stockMovementSchema), ProduitController.addStockMovement);

export default router;
