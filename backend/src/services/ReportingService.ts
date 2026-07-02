import pool from '../db/connection';

export class ReportingService {
  /**
   * Profit & Loss summary for a date range
   */
  async getPnL(dateDebut: string, dateFin: string): Promise<any> {
    const { rows } = await pool.query(
      `SELECT
        -- Revenue (line-level so the 1-to-many invoice/line join does not multiply invoice totals)
        COALESCE(SUM(dl.total_ligne) FILTER (WHERE f.statut != 'annulee'), 0) as chiffre_affaires,

        -- Cost of goods sold (based on historical purchase price * quantity sold)
        COALESCE(SUM(dl.quantite * dl.prix_achat_unitaire) FILTER (WHERE f.statut != 'annulee'), 0) as cout_ventes,

        -- Gross margin
        COALESCE(SUM(dl.total_ligne - (dl.quantite * dl.prix_achat_unitaire)) FILTER (WHERE f.statut != 'annulee'), 0) as marge_brute,

        -- Gross margin percentage
        CASE
          WHEN COALESCE(SUM(dl.total_ligne) FILTER (WHERE f.statut != 'annulee'), 0) = 0 THEN 0
          ELSE ROUND(
            (COALESCE(SUM(dl.total_ligne - (dl.quantite * dl.prix_achat_unitaire)) FILTER (WHERE f.statut != 'annulee'), 0) /
             COALESCE(SUM(dl.total_ligne) FILTER (WHERE f.statut != 'annulee'), 0)) * 100, 2
          )
        END as marge_pourcentage,

        -- Number of invoices
        COUNT(DISTINCT f.id) FILTER (WHERE f.statut != 'annulee') as nombre_factures,

        -- Number of products sold
        COALESCE(SUM(dl.quantite) FILTER (WHERE f.statut != 'annulee'), 0) as produits_vendus
       FROM factures f
       LEFT JOIN document_lignes dl ON dl.document_type = 'facture' AND f.id = dl.document_id
       WHERE f.date_facture BETWEEN $1 AND $2
         AND f.deleted_at IS NULL`,
      [dateDebut, dateFin]
    );
    return rows[0];
  }

  /**
   * Receivables aging report (who owes what)
   */
  async getReceivablesAging(): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT
        c.id as client_id,
        c.raison_sociale as nom,
        c.prenom,
        COALESCE(SUM(f.remaining_due) FILTER (WHERE f.statut IN ('en_attente', 'partielle') AND f.deleted_at IS NULL), 0) as total_du,
        COALESCE(SUM(f.remaining_due) FILTER (WHERE f.statut IN ('en_attente', 'partielle') AND f.deleted_at IS NULL AND f.date_facture >= CURRENT_DATE - INTERVAL '30 days'), 0) as moins_30_jours,
        COALESCE(SUM(f.remaining_due) FILTER (WHERE f.statut IN ('en_attente', 'partielle') AND f.deleted_at IS NULL AND f.date_facture BETWEEN CURRENT_DATE - INTERVAL '60 days' AND CURRENT_DATE - INTERVAL '30 days'), 0) as entre_30_60_jours,
        COALESCE(SUM(f.remaining_due) FILTER (WHERE f.statut IN ('en_attente', 'partielle') AND f.deleted_at IS NULL AND f.date_facture < CURRENT_DATE - INTERVAL '60 days'), 0) as plus_60_jours
       FROM tiers c
       LEFT JOIN factures f ON c.id = f.tiers_id
       WHERE c.est_client = true AND c.deleted_at IS NULL
       GROUP BY c.id, c.raison_sociale, c.prenom
       HAVING COALESCE(SUM(f.remaining_due) FILTER (WHERE f.statut IN ('en_attente', 'partielle') AND f.deleted_at IS NULL), 0) > 0
       ORDER BY total_du DESC`
    );
    return rows;
  }

  /**
   * Inventory valuation report (FIFO-style weighted average)
   */
  async getInventoryValuation(): Promise<any> {
    const { rows } = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL) as total_produits,
        COALESCE(SUM(stock) FILTER (WHERE deleted_at IS NULL), 0) as total_unites,
        COALESCE(SUM(stock * prix_achat) FILTER (WHERE deleted_at IS NULL), 0) as valeur_achat,
        COALESCE(SUM(stock * prix_vente) FILTER (WHERE deleted_at IS NULL), 0) as valeur_vente,
        COALESCE(SUM(stock * (prix_vente - prix_achat)) FILTER (WHERE deleted_at IS NULL), 0) as marge_potentielle,
        -- Average margin percentage
        CASE 
          WHEN COALESCE(SUM(stock * prix_vente) FILTER (WHERE deleted_at IS NULL), 0) = 0 THEN 0
          ELSE ROUND(
            (COALESCE(SUM(stock * (prix_vente - prix_achat)) FILTER (WHERE deleted_at IS NULL), 0) / 
             COALESCE(SUM(stock * prix_vente) FILTER (WHERE deleted_at IS NULL), 0)) * 100, 2
          )
        END as marge_moyenne_pourcentage
       FROM produits`
    );
    return rows[0];
  }

  /**
   * Inventory turnover rate
   */
  async getInventoryTurnover(days: number = 30): Promise<any> {
    const { rows } = await pool.query(
      `SELECT
        COALESCE(SUM(dl.quantite), 0) as unites_vendues,
        COALESCE(AVG(p.stock), 0) as stock_moyen,
        CASE 
          WHEN COALESCE(AVG(p.stock), 0) = 0 THEN 0
          ELSE ROUND(COALESCE(SUM(dl.quantite), 0) / AVG(p.stock), 2)
        END as taux_rotation,
        COUNT(DISTINCT p.id) as produits_actifs
       FROM document_lignes dl
       LEFT JOIN produits p ON dl.produit_id = p.id
       LEFT JOIN factures f ON dl.document_type = 'facture' AND dl.document_id = f.id
       WHERE f.date_facture >= CURRENT_DATE - ($1 || ' days')::interval
         AND f.statut != 'annulee'
         AND p.deleted_at IS NULL`,
      [days]
    );
    return rows[0];
  }

  /**
   * Sales by category
   */
  async getSalesByCategory(dateDebut: string, dateFin: string): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT
        COALESCE(p.categorie, 'Sans catégorie') as categorie,
        COUNT(DISTINCT f.id) as nombre_factures,
        SUM(dl.quantite) as unites_vendues,
        SUM(dl.total_ligne) as chiffre_affaires,
        SUM(dl.quantite * dl.prix_achat_unitaire) as cout_ventes,
        SUM(dl.total_ligne - (dl.quantite * dl.prix_achat_unitaire)) as marge_brute
       FROM factures f
       LEFT JOIN document_lignes dl ON dl.document_type = 'facture' AND f.id = dl.document_id
       LEFT JOIN produits p ON dl.produit_id = p.id
       WHERE f.date_facture BETWEEN $1 AND $2
         AND f.statut != 'annulee'
         AND f.deleted_at IS NULL
       GROUP BY p.categorie
       ORDER BY chiffre_affaires DESC`,
      [dateDebut, dateFin]
    );
    return rows;
  }

  /**
   * Product performance report
   */
  async getProductPerformance(dateDebut: string, dateFin: string, limit: number = 20): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT
        p.id,
        p.reference,
        p.nom,
        p.categorie,
        p.stock as stock_actuel,
        p.prix_achat,
        p.prix_vente,
        SUM(dl.quantite) as unites_vendues,
        SUM(dl.total_ligne) as chiffre_affaires,
        SUM(dl.quantite * dl.prix_achat_unitaire) as cout_ventes,
        SUM(dl.total_ligne - (dl.quantite * dl.prix_achat_unitaire)) as marge_brute,
        CASE 
          WHEN SUM(dl.total_ligne) = 0 THEN 0
          ELSE ROUND((SUM(dl.total_ligne - (dl.quantite * dl.prix_achat_unitaire)) / SUM(dl.total_ligne)) * 100, 2)
        END as marge_pourcentage
       FROM document_lignes dl
       LEFT JOIN produits p ON dl.produit_id = p.id
       LEFT JOIN factures f ON dl.document_type = 'facture' AND dl.document_id = f.id
       WHERE f.date_facture BETWEEN $1 AND $2
         AND f.statut != 'annulee'
         AND f.deleted_at IS NULL
         AND p.deleted_at IS NULL
       GROUP BY p.id, p.reference, p.nom, p.categorie, p.stock, p.prix_achat, p.prix_vente
       ORDER BY marge_brute DESC
       LIMIT $3`,
      [dateDebut, dateFin, limit]
    );
    return rows;
  }

  /**
   * Dashboard KPIs
   */
  async getDashboardKPIs(): Promise<any> {
    const [
      revenueResult,
      marginResult,
      receivablesResult,
      inventoryResult,
      turnoverResult,
      lowStockResult,
      pendingOrdersResult,
    ] = await Promise.all([
      // Revenue this month
      pool.query(
        `SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
         FROM factures
         WHERE statut != 'annulee' AND deleted_at IS NULL
           AND EXTRACT(MONTH FROM date_facture) = EXTRACT(MONTH FROM CURRENT_DATE)
           AND EXTRACT(YEAR FROM date_facture) = EXTRACT(YEAR FROM CURRENT_DATE)`
      ),
      // Monthly Margin
      pool.query(
        `SELECT
          COALESCE(SUM(dl.total_ligne), 0) as revenue,
          COALESCE(SUM(dl.total_ligne - (dl.quantite * dl.prix_achat_unitaire)), 0) as profit
         FROM factures f
         JOIN document_lignes dl ON dl.document_type = 'facture' AND f.id = dl.document_id
         WHERE f.statut != 'annulee' AND f.deleted_at IS NULL
           AND EXTRACT(MONTH FROM f.date_facture) = EXTRACT(MONTH FROM CURRENT_DATE)
           AND EXTRACT(YEAR FROM f.date_facture) = EXTRACT(YEAR FROM CURRENT_DATE)`
      ),
      // Outstanding receivables
      pool.query(
        `SELECT COALESCE(SUM(remaining_due), 0) as total, COUNT(*) as count
         FROM factures
         WHERE statut IN ('en_attente', 'partielle') AND deleted_at IS NULL`
      ),
      // Inventory value
      pool.query(
        `SELECT COALESCE(SUM(stock * prix_achat), 0) as valeur
         FROM produits
         WHERE deleted_at IS NULL`
      ),
      // Inventory turnover (last 30 days)
      pool.query(
        `SELECT COALESCE(SUM(dl.quantite), 0) / NULLIF(COALESCE(AVG(p.stock), 1), 0) as taux
         FROM document_lignes dl
         LEFT JOIN produits p ON dl.produit_id = p.id
         LEFT JOIN factures f ON dl.document_type = 'facture' AND dl.document_id = f.id
         WHERE f.date_facture >= CURRENT_DATE - INTERVAL '30 days'
           AND f.statut != 'annulee'
           AND p.deleted_at IS NULL`
      ),
      // Low stock alerts
      pool.query(
        `SELECT COUNT(*) as count
         FROM produits
         WHERE stock <= stock_min AND deleted_at IS NULL`
      ),
      // Pending orders
      pool.query(
        `SELECT COUNT(*) as count
         FROM commandes_fournisseur
         WHERE statut IN ('en_attente', 'validee', 'expediee') AND deleted_at IS NULL`
      ),
    ]);

    const revenueMois = revenueResult.rows[0];
    const marginMoisRows = marginResult.rows[0];
    const marginMoisPct = marginMoisRows.revenue > 0 
      ? parseFloat(((marginMoisRows.profit / marginMoisRows.revenue) * 100).toFixed(2))
      : 0;

    return {
      revenue_mois: revenueMois,
      creances: receivablesResult.rows[0],
      valeur_stock: inventoryResult.rows[0],
      taux_rotation: parseFloat(turnoverResult.rows[0].taux || 0),
      alertes_stock: parseInt(lowStockResult.rows[0].count),
      commandes_en_cours: parseInt(pendingOrdersResult.rows[0].count),
      marge_mois: {
        marge_brute: parseFloat(marginMoisRows.profit),
        marge_pourcentage: marginMoisPct
      }
    };
  }

  /**
   * Detailed margins report
   */
  async getMarginsReport(dateDebut: string, dateFin: string): Promise<any> {
    const [monthlyTrend, topTiers, topCategories, topProducts] = await Promise.all([
      // Margin trend by month
      pool.query(
        `SELECT
          DATE_TRUNC('month', f.date_facture)::date as mois,
          SUM(dl.total_ligne) as chiffre_affaires,
          SUM(dl.quantite * dl.prix_achat_unitaire) as cout_ventes,
          SUM(dl.total_ligne - (dl.quantite * dl.prix_achat_unitaire)) as marge_brute,
          CASE
            WHEN SUM(dl.total_ligne) = 0 THEN 0
            ELSE ROUND((SUM(dl.total_ligne - (dl.quantite * dl.prix_achat_unitaire)) / SUM(dl.total_ligne)) * 100, 2)
          END as marge_pourcentage
         FROM factures f
         JOIN document_lignes dl ON dl.document_type = 'facture' AND f.id = dl.document_id
         WHERE f.date_facture BETWEEN $1 AND $2
           AND f.statut != 'annulee'
           AND f.deleted_at IS NULL
         GROUP BY DATE_TRUNC('month', f.date_facture)
         ORDER BY mois ASC`,
        [dateDebut, dateFin]
      ),
      // Margins by client (top 10)
      pool.query(
        `SELECT
          t.id as tiers_id,
          t.raison_sociale as nom,
          SUM(dl.total_ligne) as chiffre_affaires,
          SUM(dl.quantite * dl.prix_achat_unitaire) as cout_ventes,
          SUM(dl.total_ligne - (dl.quantite * dl.prix_achat_unitaire)) as marge_brute,
          CASE
            WHEN SUM(dl.total_ligne) = 0 THEN 0
            ELSE ROUND((SUM(dl.total_ligne - (dl.quantite * dl.prix_achat_unitaire)) / SUM(dl.total_ligne)) * 100, 2)
          END as marge_pourcentage
         FROM factures f
         JOIN document_lignes dl ON dl.document_type = 'facture' AND f.id = dl.document_id
         JOIN tiers t ON f.tiers_id = t.id
         WHERE f.date_facture BETWEEN $1 AND $2
           AND f.statut != 'annulee'
           AND f.deleted_at IS NULL
         GROUP BY t.id, t.raison_sociale
         ORDER BY marge_brute DESC
         LIMIT 10`,
        [dateDebut, dateFin]
      ),
      // Margins by product category
      pool.query(
        `SELECT
          COALESCE(p.categorie, 'Sans catégorie') as categorie,
          SUM(dl.total_ligne) as chiffre_affaires,
          SUM(dl.quantite * dl.prix_achat_unitaire) as cout_ventes,
          SUM(dl.total_ligne - (dl.quantite * dl.prix_achat_unitaire)) as marge_brute,
          CASE
            WHEN SUM(dl.total_ligne) = 0 THEN 0
            ELSE ROUND((SUM(dl.total_ligne - (dl.quantite * dl.prix_achat_unitaire)) / SUM(dl.total_ligne)) * 100, 2)
          END as marge_pourcentage
         FROM factures f
         JOIN document_lignes dl ON dl.document_type = 'facture' AND f.id = dl.document_id
         JOIN produits p ON dl.produit_id = p.id
         WHERE f.date_facture BETWEEN $1 AND $2
           AND f.statut != 'annulee'
           AND f.deleted_at IS NULL
         GROUP BY p.categorie
         ORDER BY marge_brute DESC`,
        [dateDebut, dateFin]
      ),
      // Margins by product (top 15)
      pool.query(
        `SELECT
          p.id as produit_id,
          p.nom,
          p.reference,
          SUM(dl.quantite) as unites_vendues,
          SUM(dl.total_ligne) as chiffre_affaires,
          SUM(dl.quantite * dl.prix_achat_unitaire) as cout_ventes,
          SUM(dl.total_ligne - (dl.quantite * dl.prix_achat_unitaire)) as marge_brute,
          CASE
            WHEN SUM(dl.total_ligne) = 0 THEN 0
            ELSE ROUND((SUM(dl.total_ligne - (dl.quantite * dl.prix_achat_unitaire)) / SUM(dl.total_ligne)) * 100, 2)
          END as marge_pourcentage
         FROM factures f
         JOIN document_lignes dl ON dl.document_type = 'facture' AND f.id = dl.document_id
         JOIN produits p ON dl.produit_id = p.id
         WHERE f.date_facture BETWEEN $1 AND $2
           AND f.statut != 'annulee'
           AND f.deleted_at IS NULL
           AND p.deleted_at IS NULL
         GROUP BY p.id, p.nom, p.reference
         ORDER BY marge_brute DESC
         LIMIT 15`,
        [dateDebut, dateFin]
      ),
    ]);

    return {
      monthly_trend: monthlyTrend.rows,
      top_tiers: topTiers.rows,
      top_categories: topCategories.rows,
      top_products: topProducts.rows,
    };
  }

  /**
   * Tendances de revenus par mois pour N derniers mois
   */
  async getRevenueTrends(months: number = 12): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT
         TO_CHAR(date_trunc('month', f.date_facture), 'YYYY-MM') as mois,
         SUM(f.total) as chiffre_affaires,
         COUNT(DISTINCT f.id) as nombre_factures,
         COALESCE(SUM(f.remaining_due), 0) as impayes
       FROM factures f
       WHERE f.date_facture >= CURRENT_DATE - ($1 || ' months')::INTERVAL
         AND f.statut != 'annulee'
         AND f.deleted_at IS NULL
       GROUP BY date_trunc('month', f.date_facture)
       ORDER BY mois ASC`,
      [months]
    );
    return rows;
  }

  /**
   * Comparaison année sur année (YoY)
   * Compare les N derniers mois de l'année courante avec la même période l'année précédente
   */
  async getYoYComparison(months: number = 6): Promise<{
    current_year: any[];
    previous_year: any[];
    variation_pct: number;
  }> {
    const [currentResult, previousResult] = await Promise.all([
      pool.query(
        `SELECT
           TO_CHAR(date_trunc('month', f.date_facture), 'MM') as mois_num,
           TO_CHAR(date_trunc('month', f.date_facture), 'Month') as mois_nom,
           SUM(f.total) as chiffre_affaires,
           COUNT(DISTINCT f.id) as nombre_factures
         FROM factures f
         WHERE f.date_facture >= date_trunc('month', CURRENT_DATE) - ($1 || ' months')::INTERVAL
           AND f.date_facture < date_trunc('month', CURRENT_DATE)
           AND f.statut != 'annulee'
           AND f.deleted_at IS NULL
         GROUP BY date_trunc('month', f.date_facture)
         ORDER BY mois_num ASC`,
        [months]
      ),
      pool.query(
        `SELECT
           TO_CHAR(date_trunc('month', f.date_facture), 'MM') as mois_num,
           TO_CHAR(date_trunc('month', f.date_facture), 'Month') as mois_nom,
           SUM(f.total) as chiffre_affaires,
           COUNT(DISTINCT f.id) as nombre_factures
         FROM factures f
         WHERE f.date_facture >= date_trunc('month', CURRENT_DATE - INTERVAL '1 year') - ($1 || ' months')::INTERVAL
           AND f.date_facture < date_trunc('month', CURRENT_DATE - INTERVAL '1 year')
           AND f.statut != 'annulee'
           AND f.deleted_at IS NULL
         GROUP BY date_trunc('month', f.date_facture)
         ORDER BY mois_num ASC`,
        [months]
      ),
    ]);

    const currentTotal = currentResult.rows.reduce((s: number, r: any) => s + parseFloat(r.chiffre_affaires || '0'), 0);
    const previousTotal = previousResult.rows.reduce((s: number, r: any) => s + parseFloat(r.chiffre_affaires || '0'), 0);
    const variation_pct = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0;

    return {
      current_year: currentResult.rows,
      previous_year: previousResult.rows,
      variation_pct: Math.round(variation_pct * 100) / 100,
    };
  }

  /**
   * Prévisions de revenus simple (moyenne mobile sur 3 mois)
   */
  async getRevenueForecast(): Promise<{
    forecast: { mois: string; prevision: number; min: number; max: number };
    historique: any[];
  }> {
    const { rows: historique } = await pool.query(
      `SELECT
         TO_CHAR(date_trunc('month', f.date_facture), 'YYYY-MM') as mois,
         SUM(f.total) as chiffre_affaires
       FROM factures f
       WHERE f.statut != 'annulee' AND f.deleted_at IS NULL
       GROUP BY date_trunc('month', f.date_facture)
       ORDER BY mois DESC
       LIMIT 6`
    );

    const values = historique.map(r => parseFloat(r.chiffre_affaires) || 0);
    const moyenneMobile = values.length >= 3
      ? values.slice(0, 3).reduce((a, b) => a + b, 0) / 3
      : values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);

    const ecartType = values.length >= 2
      ? Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - moyenneMobile, 2), 0) / values.length)
      : moyenneMobile * 0.2;

    const dernierMois = historique.length > 0 ? historique[0].mois : new Date().toISOString().slice(0, 7);
    const [annee, mois] = dernierMois.split('-').map(Number);
    const prochainMois = mois === 12 ? `${annee + 1}-01` : `${annee}-${String(mois + 1).padStart(2, '0')}`;

    return {
      historique: historique.reverse(),
      forecast: {
        mois: prochainMois,
        prevision: Math.round(moyenneMobile),
        min: Math.round(Math.max(0, moyenneMobile - ecartType * 1.5)),
        max: Math.round(moyenneMobile + ecartType * 1.5),
      },
    };
  }

  /**
   * Dashboard consolidé multi-magasins
   */
  async getConsolidatedDashboard(magasinId?: number): Promise<any> {
    const locationFilter = magasinId ? `AND l.id = ${magasinId}` : '';

    const [stats, stockValue, recentActivity] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(DISTINCT f.id) as total_factures,
          COALESCE(SUM(f.total), 0) as ca_total,
          COALESCE(AVG(f.total), 0) as panier_moyen,
          COUNT(DISTINCT f.tiers_id) as clients_actifs
        FROM factures f
        WHERE f.date_facture >= CURRENT_DATE - INTERVAL '30 days'
          AND f.statut != 'annulee'
          AND f.deleted_at IS NULL
      `),
      pool.query(`
        SELECT
          COUNT(*) as total_produits,
          COALESCE(SUM(spl.quantite), 0) as stock_total,
          -- Canonical inventory valuation: maintained per-location value (= quantite × cmp),
          -- kept correct on receptions, sales and transfers by trigger trg_stock_valeur_invariant (076).
          COALESCE(SUM(spl.valeur_stock), 0) as valeur_stock
        FROM stock_par_location spl
        JOIN stock_locations l ON spl.location_id = l.id
        JOIN produits p ON p.id = spl.produit_id
        WHERE l.actif = true ${locationFilter}
      `),
      pool.query(`
        SELECT 'facture' as type, f.numero_facture as reference, f.total, f.date_facture as date,
               t.raison_sociale as tiers_nom
        FROM factures f
        LEFT JOIN tiers t ON f.tiers_id = t.id
        WHERE f.deleted_at IS NULL AND f.statut != 'annulee'
        UNION ALL
        SELECT 'reception' as type, r.numero_reception as reference, rl.total_ligne as total, r.date_reception as date,
               tf.raison_sociale as tiers_nom
        FROM receptions r
        JOIN reception_lignes rl ON r.id = rl.reception_id
        LEFT JOIN commandes_fournisseur c ON r.commande_id = c.id
        LEFT JOIN tiers tf ON c.tiers_id = tf.id
        ORDER BY date DESC LIMIT 10
      `),
    ]);

    return {
      stats: stats.rows[0],
      stock: stockValue.rows[0],
      recent_activity: recentActivity.rows,
    };
  }

  async getAlerts(): Promise<{
    low_stock: any[];
    overdue_invoices: any[];
    pending_orders: any[];
  }> {
    const [lowStock, overdueInvoices, pendingOrders] = await Promise.all([
      pool.query(
        `SELECT p.id, p.nom, p.reference, p.stock, p.stock_min,
                COALESCE(l.nom, 'Principal') as location_nom
         FROM produits p
         LEFT JOIN stock_locations l ON p.location_id = l.id
         WHERE p.stock <= p.stock_min AND p.stock_min > 0
         ORDER BY (p.stock_min - p.stock) DESC
         LIMIT 20`
      ),
      pool.query(
        `SELECT f.id, f.numero_facture, f.total, f.montant_paye,
                f.date_facture, f.date_echeance,
                COALESCE(t.raison_sociale, 'Client inconnu') as client_nom
         FROM factures f
         LEFT JOIN tiers t ON f.tiers_id = t.id
         WHERE f.statut IN ('en_attente', 'partielle')
           AND f.date_echeance < CURRENT_DATE - INTERVAL '30 days'
           AND f.deleted_at IS NULL
         ORDER BY f.date_echeance ASC
         LIMIT 20`
      ),
      pool.query(
        `SELECT c.id, c.numero_commande, c.date_commande, c.date_livraison_prevue,
                COALESCE(t.raison_sociale, 'Fournisseur inconnu') as fournisseur_nom
         FROM commandes c
         LEFT JOIN tiers t ON c.tiers_id = t.id
         WHERE c.statut NOT IN ('livree', 'annulee')
           AND c.date_livraison_prevue < CURRENT_DATE
         ORDER BY c.date_livraison_prevue ASC
         LIMIT 20`
      ),
    ]);

    return {
      low_stock: lowStock.rows,
      overdue_invoices: overdueInvoices.rows,
      pending_orders: pendingOrders.rows,
    };
  }
}

export const reportingService = new ReportingService();
