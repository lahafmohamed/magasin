-- ============================================================
-- 098_company_settings_modules.sql
--
-- Permet à chaque client de masquer les modules de l'ERP qu'il n'utilise pas
-- (ex. une boutique sans dépôt n'a que faire d'« Emplacements », « Transferts »
-- ou « Demandes Réappro »). Le menu s'allège d'autant.
--
-- On stocke la liste des modules DÉSACTIVÉS, pas celle des modules actifs :
-- ainsi tout module ajouté plus tard au catalogue est visible par défaut. Avec
-- une liste d'inclusion, chaque nouveauté serait invisible chez tous les
-- clients existants jusqu'à ce que quelqu'un pense à la cocher.
--
-- Un tableau vide (défaut) = tout est actif, soit le comportement actuel.
-- Idempotent.
-- ============================================================

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS modules_desactives JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Garde-fou : la colonne doit rester un tableau JSON, jamais un objet ou un
-- scalaire — le backend et le frontend itèrent dessus sans revérifier le type.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_settings_modules_desactives_is_array'
  ) THEN
    ALTER TABLE company_settings
      ADD CONSTRAINT company_settings_modules_desactives_is_array
      CHECK (jsonb_typeof(modules_desactives) = 'array');
  END IF;
END $$;

COMMENT ON COLUMN company_settings.modules_desactives IS
  'Clés des modules masqués dans l''interface (liste d''exclusion). [] = tout actif.';
