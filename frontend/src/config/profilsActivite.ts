import type { TypeActivite } from '@/services/api';
import { MODULES_VERROUILLES } from './modules';

/**
 * Profils métier (lot 1, migration 109 — `company_settings.type_activite`).
 *
 * Un seul programme sert des boutiques d'informatique, d'habillement, des
 * libre-services… Le profil ne change aucune donnée : il propose les modules
 * utiles au métier (l'administrateur applique le préréglage depuis les
 * paramètres, jamais en silence) et dit quel écran de vente ouvrir en premier.
 *
 * `masques` reprend le stockage des modules (liste d'EXCLUSION) : tout module
 * absent de la liste reste actif, y compris ceux ajoutés plus tard.
 */
export interface ProfilActivite {
  value: TypeActivite;
  label: string;
  description: string;
  /** Modules masqués par le préréglage. */
  masques: readonly string[];
  /** Écran de vente proposé en premier (tableau de bord, raccourcis). */
  venteParDefaut: '/vente-comptoir' | '/factures/nouvelle';
}

export const PROFILS_ACTIVITE: readonly ProfilActivite[] = [
  {
    value: 'general',
    label: 'Commerce général',
    description: 'Tous les modules restent affichés',
    masques: [],
    venteParDefaut: '/factures/nouvelle',
  },
  {
    value: 'informatique',
    label: 'Informatique et électronique',
    description: 'Détail et gros : devis, bons de livraison, crédit client et relances',
    masques: [],
    venteParDefaut: '/factures/nouvelle',
  },
  {
    value: 'habillement',
    label: 'Habillement et mode',
    description: 'Vente au comptoir par scan, échanges et retours, sans devis ni bons de livraison',
    masques: ['devis', 'bons-livraison', 'relances'],
    venteParDefaut: '/vente-comptoir',
  },
  {
    value: 'libre_service',
    label: 'Libre-service et supérette',
    description: 'Passage en caisse rapide par scan, paiement immédiat, sans devis ni crédit client',
    masques: ['devis', 'bons-livraison', 'relances', 'analyse-clients'],
    venteParDefaut: '/vente-comptoir',
  },
];

export function profilActivite(value: string | null | undefined): ProfilActivite {
  return PROFILS_ACTIVITE.find((p) => p.value === value) ?? PROFILS_ACTIVITE[0];
}

/** Modules masqués par le préréglage — jamais un module verrouillé. */
export function modulesDuProfil(value: TypeActivite): string[] {
  return profilActivite(value).masques.filter((k) => !MODULES_VERROUILLES.includes(k));
}

/** Le menu actuel diffère-t-il du préréglage du profil ? */
export function differeDuProfil(value: TypeActivite, modulesDesactives: readonly string[]): boolean {
  const attendu = new Set(modulesDuProfil(value));
  const actuel = new Set(modulesDesactives);
  if (attendu.size !== actuel.size) return true;
  for (const k of attendu) if (!actuel.has(k)) return true;
  return false;
}
