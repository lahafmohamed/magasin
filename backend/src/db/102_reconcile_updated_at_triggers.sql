-- 102_reconcile_updated_at_triggers.sql
--
-- Suite de `101` : même cause, autre symptôme.
--
-- Le baseline en masse du 2026-06-20 (70 migrations enregistrées en une minute
-- sans être exécutées) a aussi privé la production de huit triggers
-- `update_*_updated_at`. Conséquence silencieuse : sur ces huit tables, la
-- colonne `updated_at` garde la valeur posée à l'INSERT et ne bouge plus jamais.
-- Rien ne plante — c'est justement pourquoi personne ne l'a vu — mais toute
-- lecture de `updated_at` (tri « modifié récemment », détection de changement,
-- export) y est fausse.
--
-- La fonction `update_updated_at_column()` existe déjà en production ; il ne
-- manquait que les attaches. `DROP TRIGGER IF EXISTS` avant chaque création rend
-- la migration rejouable et sans effet sur une base canonique.

BEGIN;

DROP TRIGGER IF EXISTS update_demandes_lignes_updated_at ON demandes_reapprovisionnement_lignes;
CREATE TRIGGER update_demandes_lignes_updated_at
  BEFORE UPDATE ON demandes_reapprovisionnement_lignes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_demandes_reapprovisionnement_updated_at ON demandes_reapprovisionnement;
CREATE TRIGGER update_demandes_reapprovisionnement_updated_at
  BEFORE UPDATE ON demandes_reapprovisionnement
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_depenses_updated_at ON depenses;
CREATE TRIGGER update_depenses_updated_at
  BEFORE UPDATE ON depenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_employes_updated_at ON employes;
CREATE TRIGGER update_employes_updated_at
  BEFORE UPDATE ON employes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_produits_updated_at ON produits;
CREATE TRIGGER update_produits_updated_at
  BEFORE UPDATE ON produits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_stock_locations_updated_at ON stock_locations;
CREATE TRIGGER update_stock_locations_updated_at
  BEFORE UPDATE ON stock_locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_stock_par_location_updated_at ON stock_par_location;
CREATE TRIGGER update_stock_par_location_updated_at
  BEFORE UPDATE ON stock_par_location
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_utilisateurs_updated_at ON utilisateurs;
CREATE TRIGGER update_utilisateurs_updated_at
  BEFORE UPDATE ON utilisateurs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
