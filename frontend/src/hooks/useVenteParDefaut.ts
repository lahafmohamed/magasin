import { useModules } from '../lib/ModulesContext';
import { profilActivite } from '../config/profilsActivite';
import { useRouteAccess } from './useRouteAccess';

export interface VenteParDefaut {
  path: '/vente-comptoir' | '/factures/nouvelle';
  label: string;
}

/**
 * Écran où commence une vente, selon le profil métier (lot 1) : la vente
 * comptoir pour l'habillement et le libre-service, la facture sinon. Retombe
 * sur l'autre écran quand le premier est masqué ou refusé au rôle ; `null`
 * quand l'utilisateur ne vend pas.
 */
export function useVenteParDefaut(): VenteParDefaut | null {
  const { typeActivite } = useModules();
  const canOpen = useRouteAccess();
  const comptoir: VenteParDefaut = { path: '/vente-comptoir', label: 'Nouvelle vente' };
  const facture: VenteParDefaut = { path: '/factures/nouvelle', label: 'Nouvelle facture' };
  const ordre = profilActivite(typeActivite).venteParDefaut === '/vente-comptoir' ? [comptoir, facture] : [facture];
  return ordre.find((v) => canOpen(v.path)) ?? null;
}
