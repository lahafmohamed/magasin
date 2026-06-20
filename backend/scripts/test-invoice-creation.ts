import pool from '../src/db/connection';
import { factureService } from '../src/services/FactureService';
import bonLivraisonService from '../src/services/BonLivraisonService';

const createdIds = {
  clientIds: [] as number[],
  productIds: [] as number[],
  devisIds: [] as number[],
  blIds: [] as number[],
  invoiceIds: [] as number[],
};

// Colors for console logging
const green = '\x1b[32m';
const red = '\x1b[31m';
const yellow = '\x1b[33m';
const reset = '\x1b[0m';

function logSuccess(msg: string) {
  console.log(`${green}✅ ${msg}${reset}`);
}

function logError(msg: string) {
  console.error(`${red}❌ ${msg}${reset}`);
}

function logStep(msg: string) {
  console.log(`\n${yellow}👉 ${msg}${reset}`);
}

async function createTestClient(raisonSociale: string, creditMax = 0, soldeActuel = 0): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO tiers (raison_sociale, email, telephone, adresse, credit_max, solde_client_actuel, delai_paiement, est_client, est_fournisseur)
     VALUES ($1, $2, $3, $4, $5, $6, 'immediat', true, false)
     RETURNING id`,
    [raisonSociale, `test-${Date.now()}@example.com`, '00000000', 'Test address', creditMax, soldeActuel]
  );
  const id = rows[0].id;
  createdIds.clientIds.push(id);
  return id;
}

async function createTestProduct(nom: string, stock: number, prixVente: number, locationId: number): Promise<number> {
  const reference = `TEST-REF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const { rows } = await pool.query(
    `INSERT INTO produits (reference, nom, prix_achat, prix_vente, stock, stock_min)
     VALUES ($1, $2, 1000, $3, $4, 5)
     RETURNING id`,
    [reference, nom, prixVente, stock]
  );
  const productId = rows[0].id;
  createdIds.productIds.push(productId);

  // Initialize stock in location
  await pool.query(
    `INSERT INTO stock_par_location (produit_id, location_id, quantite)
     VALUES ($1, $2, $3)`,
    [productId, locationId, stock]
  );

  return productId;
}

async function runTests() {
  console.log('🚀 STARTING COMPREHENSIVE INVOICE CREATION TESTS...\n');

  // Get main location
  const { rows: locRows } = await pool.query(
    'SELECT id FROM stock_locations WHERE est_principal = true AND actif = true LIMIT 1'
  );
  if (locRows.length === 0) {
    throw new Error('No active principal stock location found. Please run setup first.');
  }
  const locId = locRows[0].id;
  logSuccess(`Using principal location ID: ${locId}`);

  // Create a client and product
  const clientId = await createTestClient('TEST-INVOICE Client');
  const productId1 = await createTestProduct('TEST-INVOICE Product 1', 100, 5000, locId);
  const productId2 = await createTestProduct('TEST-INVOICE Product 2', 50, 10000, locId);

  // ==========================================
  // TEST CASE 1: Direct Invoice Creation
  // ==========================================
  logStep('TEST 1: Direct Invoice Creation');
  
  const directInvoiceResult = await factureService.create({
    tiers_id: clientId,
    lignes: [
      { produit_id: productId1, quantite: 10, prix_unitaire: 5000 },
      { produit_id: productId2, quantite: 2, prix_unitaire: 10000 },
    ],
    location_id: locId,
    notes: 'TEST-SCRIPT-DIRECT-INVOICE',
  });
  createdIds.invoiceIds.push(directInvoiceResult.id);
  logSuccess(`Created Invoice ID: ${directInvoiceResult.id}, Number: ${directInvoiceResult.numero_facture}, Total: ${directInvoiceResult.total}`);

  // 1. Verify invoice details
  const { rows: invoiceRows } = await pool.query('SELECT * FROM factures WHERE id = $1', [directInvoiceResult.id]);
  if (invoiceRows.length === 0) throw new Error('Invoice record not found in DB');
  const invoice = invoiceRows[0];
  if (parseFloat(invoice.total) !== 70000) throw new Error(`Incorrect total. Expected 70000, got ${invoice.total}`);
  logSuccess('Invoice record matches expected total');

  // 2. Verify stock deduction in location
  const { rows: stock1Rows } = await pool.query(
    'SELECT quantite FROM stock_par_location WHERE produit_id = $1 AND location_id = $2',
    [productId1, locId]
  );
  if (stock1Rows[0].quantite !== 90) throw new Error(`Stock deduction failed for product 1. Expected 90, got ${stock1Rows[0].quantite}`);
  
  const { rows: stock2Rows } = await pool.query(
    'SELECT quantite FROM stock_par_location WHERE produit_id = $1 AND location_id = $2',
    [productId2, locId]
  );
  if (stock2Rows[0].quantite !== 48) throw new Error(`Stock deduction failed for product 2. Expected 48, got ${stock2Rows[0].quantite}`);
  logSuccess('Stock correctly deducted from locations');

  // 3. Verify stock movements
  const { rows: mvtRows } = await pool.query(
    'SELECT * FROM mouvements_stock WHERE reference_liee = $1 ORDER BY quantite ASC',
    [directInvoiceResult.numero_facture]
  );
  if (mvtRows.length !== 2) throw new Error(`Expected 2 stock movements, got ${mvtRows.length}`);
  if (parseInt(mvtRows[0].quantite) !== -10) throw new Error(`Incorrect quantity in movement 1: ${mvtRows[0].quantite}`);
  if (parseInt(mvtRows[1].quantite) !== -2) throw new Error(`Incorrect quantity in movement 2: ${mvtRows[1].quantite}`);
  logSuccess('Stock movements successfully logged');

  // 4. Verify client ledger entries
  const { rows: ledgerRows } = await pool.query(
    "SELECT * FROM compte_client_lignes WHERE document_id = $1 AND type_operation = 'facture'",
    [directInvoiceResult.id]
  );
  if (ledgerRows.length === 0) throw new Error('Client ledger entry not found');
  if (parseFloat(ledgerRows[0].montant_debit) !== 70000) throw new Error(`Incorrect ledger debit: ${ledgerRows[0].montant_debit}`);
  logSuccess('Client ledger correctly logged debit entry');

  // 5. Verify client balance update
  const { rows: clientRows } = await pool.query('SELECT solde_client_actuel FROM tiers WHERE id = $1', [clientId]);
  if (parseFloat(clientRows[0].solde_client_actuel) !== 70000) {
    throw new Error(`Client balance not updated. Expected 70000, got ${clientRows[0].solde_client_actuel}`);
  }
  logSuccess(`Client balance successfully updated to: ${clientRows[0].solde_client_actuel}`);

  // 6. Verify accounting triggers
  const { rows: accRows } = await pool.query(
    "SELECT ec.*, pc.numero as compte_no FROM ecritures_comptables ec JOIN plan_comptable pc ON ec.compte_id = pc.id WHERE ec.piece_id = $1 AND ec.piece_type = 'facture'",
    [directInvoiceResult.id]
  );
  if (accRows.length < 2) throw new Error(`Expected at least 2 accounting entries, got ${accRows.length}`);
  
  const debitEntry = accRows.find(e => e.compte_no === '411');
  const creditEntry = accRows.find(e => e.compte_no === '701');

  if (!debitEntry || parseFloat(debitEntry.debit) !== 70000) throw new Error('Debit entry on account 411 is missing or incorrect');
  if (!creditEntry || parseFloat(creditEntry.credit) !== 70000) throw new Error('Credit entry on account 701 is missing or incorrect');
  logSuccess('Double-entry accounting journal lines successfully generated and balanced');

  // ==========================================
  // TEST CASE 2: Validation - Credit Limit
  // ==========================================
  logStep('TEST 2: Validation - Credit Limit');
  
  // Set credit limit for client
  await pool.query('UPDATE tiers SET credit_max = 80000 WHERE id = $1', [clientId]);

  // Try to create an invoice that would push balance to 70000 + 15000 = 85000 (> 80000 limit)
  try {
    await factureService.create({
      tiers_id: clientId,
      lignes: [{ produit_id: productId1, quantite: 3, prix_unitaire: 5000 }],
      location_id: locId,
    });
    throw new Error('Credit limit check failed: invoice was incorrectly created');
  } catch (error: any) {
    if (error.message.includes('Plafond de crédit dépassé')) {
      logSuccess('Credit limit violation correctly blocked creation');
    } else {
      throw error;
    }
  }

  // Restore credit limit to infinite
  await pool.query('UPDATE tiers SET credit_max = 0 WHERE id = $1', [clientId]);

  // ==========================================
  // TEST CASE 3: Validation - Stock Rollback
  // ==========================================
  logStep('TEST 3: Validation - Stock Rollback');

  const productIdLow = await createTestProduct('TEST-LOW-STOCK Product', 5, 2000, locId);
  
  try {
    // This invoice has enough stock for product 1 (90 available, requests 5) but NOT enough for product low (5 available, requests 10)
    await factureService.create({
      tiers_id: clientId,
      lignes: [
        { produit_id: productId1, quantite: 5, prix_unitaire: 5000 },
        { produit_id: productIdLow, quantite: 10, prix_unitaire: 2000 }, // Fails
      ],
      location_id: locId,
    });
    throw new Error('Insufficient stock check failed: invoice was incorrectly created');
  } catch (error: any) {
    if (error.message.includes('Stock insuffisant')) {
      logSuccess('Stock check correctly blocked creation');
      
      // Verify rollback: stock of product 1 should STILL be 90 (no partial deduction)
      const { rows: checkStock } = await pool.query(
        'SELECT quantite FROM stock_par_location WHERE produit_id = $1 AND location_id = $2',
        [productId1, locId]
      );
      if (checkStock[0].quantite !== 90) {
        throw new Error(`Transaction rollback failed! Stock of product 1 was partially deducted to: ${checkStock[0].quantite}`);
      }
      logSuccess('Transaction successfully rolled back, preventing partial stock deduction');
    } else {
      throw error;
    }
  }

  // ==========================================
  // TEST CASE 4: Conversion - BL to Invoice
  // ==========================================
  logStep('TEST 4: Conversion - BL to Invoice');

  // 1. Create a devis
  const devisNo = `DEV-TEST-${Date.now()}`;
  const { rows: devisRows } = await pool.query(
    `INSERT INTO devis (tiers_id, date_devis, sous_total, tva, total, statut, location_id, numero_devis)
     VALUES ($1, CURRENT_DATE, 15000, 0, 15000, 'accepte', $2, $3)
     RETURNING id`,
    [clientId, locId, devisNo]
  );
  const devisId = devisRows[0].id;
  createdIds.devisIds.push(devisId);

  await pool.query(
    `INSERT INTO document_lignes (document_type, document_id, produit_id, quantite, prix_unitaire, total_ligne)
     VALUES ('devis', $1, $2, 3, 5000, 15000)`,
    [devisId, productId1]
  );

  // 2. Create a BL linked to devis
  const blNo = `BL-TEST-${Date.now()}`;
  const { rows: blRows } = await pool.query(
    `INSERT INTO bons_livraison (numero_bl, tiers_id, devis_id, date_bl, sous_total, tva, total, location_id, statut)
     VALUES ($1, $2, $3, CURRENT_DATE, 15000, 0, 15000, $4, 'valide')
     RETURNING id`,
    [blNo, clientId, devisId, locId]
  );
  const blId = blRows[0].id;
  createdIds.blIds.push(blId);

  await pool.query(
    `INSERT INTO document_lignes (document_type, document_id, produit_id, quantite, quantite_livree, prix_unitaire, total_ligne)
     VALUES ('bl', $1, $2, 3, 3, 5000, 15000)`,
    [blId, productId1]
  );

  // 3. Deliver the BL (which deducts stock)
  await bonLivraisonService.updateStatut(blId, 'livre');
  
  // Stock of product 1 should now be 87 (90 - 3)
  const { rows: checkStockAfterBL } = await pool.query(
    'SELECT quantite FROM stock_par_location WHERE produit_id = $1 AND location_id = $2',
    [productId1, locId]
  );
  if (checkStockAfterBL[0].quantite !== 87) {
    throw new Error(`BL stock deduction failed. Expected 87, got ${checkStockAfterBL[0].quantite}`);
  }
  logSuccess('BL successfully delivered and stock deducted (Stock: 87)');

  // 4. Convert BL to Facture
  const conversionResult = await bonLivraisonService.convertToFacture(blId, 1);
  createdIds.invoiceIds.push(conversionResult.facture_id);
  logSuccess(`BL converted to invoice ID: ${conversionResult.facture_id}, Number: ${conversionResult.numero_facture}`);

  // 5. Verify BL status is updated to 'facture'
  const { rows: checkBL } = await pool.query('SELECT statut, facture_id FROM bons_livraison WHERE id = $1', [blId]);
  if (checkBL[0].statut !== 'facture') throw new Error(`Expected BL status to be 'facture', got ${checkBL[0].statut}`);
  if (checkBL[0].facture_id !== conversionResult.facture_id) throw new Error('BL not linked to correct invoice ID');
  logSuccess('BL status successfully updated to "facture" and linked');

  // 6. CRITICAL STOCK CHECK: Stock must NOT be double-deducted! It should still be 87.
  const { rows: checkStockAfterConvert } = await pool.query(
    'SELECT quantite FROM stock_par_location WHERE produit_id = $1 AND location_id = $2',
    [productId1, locId]
  );
  if (checkStockAfterConvert[0].quantite !== 87) {
    throw new Error(`CRITICAL BUG: Stock double-deducted during conversion! Expected 87, got ${checkStockAfterConvert[0].quantite}`);
  }
  logSuccess('Confirmed: No double deduction of stock during BL conversion!');

  // 7. Verify ledger and accounting entries for the converted invoice
  const { rows: convLedger } = await pool.query(
    "SELECT * FROM compte_client_lignes WHERE document_id = $1 AND type_operation = 'facture'",
    [conversionResult.facture_id]
  );
  if (convLedger.length === 0) throw new Error('Ledger entry missing for converted invoice');
  if (parseFloat(convLedger[0].montant_debit) !== 15000) throw new Error(`Incorrect ledger debit: ${convLedger[0].montant_debit}`);
  
  const { rows: convAcc } = await pool.query(
    "SELECT ec.*, pc.numero as compte_no FROM ecritures_comptables ec JOIN plan_comptable pc ON ec.compte_id = pc.id WHERE ec.piece_id = $1 AND ec.piece_type = 'facture'",
    [conversionResult.facture_id]
  );
  if (convAcc.length < 2) throw new Error(`Expected at least 2 accounting entries, got ${convAcc.length}`);
  logSuccess('Ledger and accounting entries correctly created for converted invoice');

  // Verify client balance now (70000 direct + 15000 converted = 85000)
  const { rows: checkClientBalance } = await pool.query('SELECT solde_client_actuel FROM tiers WHERE id = $1', [clientId]);
  if (parseFloat(checkClientBalance[0].solde_client_actuel) !== 85000) {
    throw new Error(`Client balance incorrect. Expected 85000, got ${checkClientBalance[0].solde_client_actuel}`);
  }
  logSuccess(`Client balance successfully updated to: ${checkClientBalance[0].solde_client_actuel}`);

  // ==========================================
  // TEST CASE 5: Delete Invoice and Restore Stock
  // ==========================================
  logStep('TEST 5: Delete Invoice and Restore Stock');

  // Direct Invoice (directInvoiceResult.id) used 10 of product 1 and 2 of product 2
  // Before delete: product 1 stock is 87, product 2 stock is 48.
  // We delete the invoice with restaurerStock = true
  const deleteResult = await factureService.delete(directInvoiceResult.id, true);
  if (!deleteResult) throw new Error('Failed to delete direct invoice');

  // Verify stock restoration
  // Product 1 stock should become: 87 + 10 = 97
  // Product 2 stock should become: 48 + 2 = 50
  const { rows: delStock1 } = await pool.query(
    'SELECT quantite FROM stock_par_location WHERE produit_id = $1 AND location_id = $2',
    [productId1, locId]
  );
  if (delStock1[0].quantite !== 97) throw new Error(`Stock 1 not restored. Expected 97, got ${delStock1[0].quantite}`);

  const { rows: delStock2 } = await pool.query(
    'SELECT quantite FROM stock_par_location WHERE produit_id = $1 AND location_id = $2',
    [productId2, locId]
  );
  if (delStock2[0].quantite !== 50) throw new Error(`Stock 2 not restored. Expected 50, got ${delStock2[0].quantite}`);
  logSuccess('Stock successfully restored upon soft deletion of invoice');

  // Verify client balance updated (should exclude the deleted invoice, so balance = 15000)
  const { rows: checkDelClientBal } = await pool.query('SELECT solde_client_actuel FROM tiers WHERE id = $1', [clientId]);
  if (parseFloat(checkDelClientBal[0].solde_client_actuel) !== 15000) {
    throw new Error(`Client balance not updated after delete. Expected 15000, got ${checkDelClientBal[0].solde_client_actuel}`);
  }
  logSuccess(`Client balance successfully updated to: ${checkDelClientBal[0].solde_client_actuel}`);

  console.log('\n🎉 ALL TESTS COMPLETED SUCCESSFULLY! NO BUGS FOUND! 🎉');
}

async function cleanup() {
  logStep('Cleaning up test data...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    if (createdIds.invoiceIds.length > 0) {
      await client.query('DELETE FROM paiements WHERE facture_id = ANY($1)', [createdIds.invoiceIds]);
      await client.query("DELETE FROM compte_client_lignes WHERE type_operation = 'facture' AND document_id = ANY($1)", [createdIds.invoiceIds]);
      await client.query("DELETE FROM ecritures_comptables WHERE piece_type = 'facture' AND piece_id = ANY($1)", [createdIds.invoiceIds]);
      await client.query("DELETE FROM document_lignes WHERE document_type = 'facture' AND document_id = ANY($1)", [createdIds.invoiceIds]);
      await client.query('DELETE FROM factures WHERE id = ANY($1)', [createdIds.invoiceIds]);
    }
    
    if (createdIds.blIds.length > 0) {
      await client.query("DELETE FROM document_lignes WHERE document_type = 'bl' AND document_id = ANY($1)", [createdIds.blIds]);
      await client.query('DELETE FROM bons_livraison WHERE id = ANY($1)', [createdIds.blIds]);
    }
    
    if (createdIds.devisIds.length > 0) {
      await client.query("DELETE FROM document_lignes WHERE document_type = 'devis' AND document_id = ANY($1)", [createdIds.devisIds]);
      await client.query('DELETE FROM devis WHERE id = ANY($1)', [createdIds.devisIds]);
    }
    
    if (createdIds.productIds.length > 0) {
      await client.query('DELETE FROM stock_par_location WHERE produit_id = ANY($1)', [createdIds.productIds]);
      await client.query('DELETE FROM mouvements_stock WHERE produit_id = ANY($1)', [createdIds.productIds]);
      await client.query('DELETE FROM produits WHERE id = ANY($1)', [createdIds.productIds]);
    }
    
    if (createdIds.clientIds.length > 0) {
      await client.query('DELETE FROM tiers WHERE id = ANY($1)', [createdIds.clientIds]);
    }
    
    await client.query('COMMIT');
    logSuccess('Cleanup completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    logError(`Cleanup failed: ${error}`);
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await runTests();
  } catch (error: any) {
    logError(`Test failed: ${error.message}`);
    console.error(error.stack);
  } finally {
    await cleanup();
    await pool.end();
  }
}

main();
