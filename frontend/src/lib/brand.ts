import { createContext, useContext } from 'react';

/**
 * Identité affichée dans le cadre de l'application (menu, onglet du navigateur).
 *
 * Avant la connexion on ne connaît que le produit, « nolyxERP » : les paramètres
 * de l'entreprise exigent une session. Après, c'est le nom de l'entreprise
 * (`company_settings.nom`) — chaque client SaaS voit le sien, plus jamais un
 * nom de produit codé en dur.
 *
 * Module volontairement autonome (aucun import de contexte ni de service) :
 * `PageShell` et `useDocumentTitle` en dépendent, et les tests de pages
 * simulent `ModulesContext` / `AuthContext` sans ce fichier.
 */

export const PRODUCT_NAME = 'nolyxERP';

/**
 * Logo livré avec le programme : une bannière rectangulaire illisible à 28 px
 * et dont le damier gris apparaît en thème sombre. Ce n'est pas la marque
 * d'un client ; tant qu'un client n'a pas fourni la sienne, on affiche un
 * monogramme.
 */
const BUNDLED_PLACEHOLDER_LOGO = '/logo.png';

export interface CompanyBrand {
  /** Nom de l'entreprise, ou « nolyxERP » tant qu'il n'est pas connu. */
  name: string;
  /** Logo propre au client (carré de préférence), sinon `null`. */
  logoUrl: string | null;
  /** Initiale du monogramme affiché sans logo. */
  initial: string;
  /** Vrai une fois les paramètres de l'entreprise chargés. */
  loaded: boolean;
}

export function buildBrand(settings?: { nom?: string | null; logo_url?: string | null } | null): CompanyBrand {
  const name = settings?.nom?.trim() || PRODUCT_NAME;
  const logo = settings?.logo_url?.trim() || null;
  return {
    name,
    logoUrl: logo && logo !== BUNDLED_PLACEHOLDER_LOGO ? logo : null,
    initial: name.charAt(0).toLocaleUpperCase('fr-FR') || 'N',
    loaded: !!settings,
  };
}

export const DEFAULT_BRAND: CompanyBrand = buildBrand(null);

export const BrandContext = createContext<CompanyBrand>(DEFAULT_BRAND);

/** Identité courante — `DEFAULT_BRAND` hors fournisseur (tests, écran de connexion). */
export function useCompanyBrand(): CompanyBrand {
  return useContext(BrandContext);
}
