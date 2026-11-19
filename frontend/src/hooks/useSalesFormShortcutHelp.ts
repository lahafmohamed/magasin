import { useMemo } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useModules } from '../lib/ModulesContext';
import { canAccessPath } from '../config/routeAccess';

/** Ligne de l'aide des raccourcis qui n'est pas un raccourci global. */
export interface ShortcutHelpRow {
  description: string;
  keys: string;
}

/** Les formulaires de vente (facture, devis, bon de livraison, avoir) sont réservés aux rôles qui vendent. */
const SALES_FORM_PATH = '/factures/nouvelle';

/**
 * « Ctrl + Entrée » enregistre un formulaire de vente (P-M5). Le raccourci est
 * géré par `DocumentFormShell` lui-même — il n'existe que dans ces
 * formulaires — et seulement décrit ici, pour l'aide des raccourcis, aux rôles
 * qui peuvent les ouvrir. « G puis N » (nouvelle facture) est un raccourci
 * global : il vit dans `useERPShortcuts`.
 */
export function useSalesFormShortcutHelp(): ShortcutHelpRow[] {
  const { user } = useAuth();
  const { estCheminActif } = useModules();
  const canSell = canAccessPath(SALES_FORM_PATH, user?.role) && estCheminActif(SALES_FORM_PATH);
  return useMemo(
    () =>
      canSell ? [{ description: 'Dans un formulaire de vente : enregistrer le document', keys: 'Ctrl + Entrée' }] : [],
    [canSell]
  );
}
