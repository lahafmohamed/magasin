import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { companySettingsService, type TypeActivite } from '@/services/api';
import { moduleForPath, estHorsV1, MODULES_HORS_V1, MODULES_VERROUILLES } from '@/config/modules';
import { useOptionalAuth } from './AuthContext';
import { BrandContext, DEFAULT_BRAND, buildBrand, type CompanyBrand } from './brand';

interface ModulesContextValue {
  /** Clés des modules masqués par l'administrateur. */
  modulesDesactives: string[];
  /** Un module est actif tant qu'il n'est pas explicitement désactivé. */
  estModuleActif: (key: string) => boolean;
  /** Une route est accessible si le module qui la couvre est actif. */
  estCheminActif: (path: string) => boolean;
  /** Métier du client (migration 109), `general` tant qu'il n'est pas connu. */
  typeActivite: TypeActivite;
  /** Recharge depuis le serveur (après enregistrement des paramètres). */
  rafraichir: () => Promise<void>;
  /**
   * Vrai tant que les paramètres de la session courante ne sont pas arrivés.
   * Le garde de route attend ce signal avant de monter une page couverte par
   * un module : sinon la page s'ouvrait, lançait ses requêtes, puis était
   * remplacée par « Module désactivé ».
   */
  chargement: boolean;
}

/**
 * État tant que le serveur n'a pas répondu : le périmètre v1. Les modules hors
 * v1 n'apparaissent qu'une fois les paramètres chargés et seulement si
 * l'éditeur les a activés — jamais par défaut, jamais sur une erreur.
 */
const MASQUES_PAR_DEFAUT: readonly string[] = MODULES_HORS_V1;

const ModulesContext = createContext<ModulesContextValue | null>(null);

function hasCachedSession(): boolean {
  try {
    return !!localStorage.getItem('auth_user');
  } catch {
    return false;
  }
}

/**
 * Paramètres de l'entreprise utiles au cadre de l'application : modules
 * masqués (menu, gardes de route) et identité (nom, logo — `BrandContext`).
 *
 * Rechargés à chaque changement d'utilisateur : avant, le chargement n'avait
 * lieu qu'au démarrage, donc après une connexion sans rechargement de page le
 * menu ignorait les modules désactivés et le nom de l'entreprise restait
 * inconnu.
 */
export function ModulesProvider({ children }: { children: React.ReactNode }) {
  const auth = useOptionalAuth();
  const userId = auth ? auth.user?.id ?? null : undefined;
  // Changement de mot de passe dû : le jeton n'ouvre que ce changement, les
  // paramètres répondraient 403. On reste sur l'identité du produit, comme à
  // l'écran de connexion, sans requête vouée à l'échec.
  const changementDu = !!auth?.user?.must_change_password;
  const [modulesDesactives, setModulesDesactives] = useState<string[]>([...MASQUES_PAR_DEFAUT]);
  const [brand, setBrand] = useState<CompanyBrand>(DEFAULT_BRAND);
  const [typeActivite, setTypeActivite] = useState<TypeActivite>('general');
  const [chargement, setChargement] = useState(true);
  const requete = useRef(0);

  const charger = useCallback(async (force = false) => {
    const id = ++requete.current;
    // Pas de session : rien à charger, et l'appel renverrait 401.
    const sessionOuverte = userId === undefined ? hasCachedSession() : userId !== null;
    if (!sessionOuverte || changementDu) {
      setModulesDesactives([...MASQUES_PAR_DEFAUT]);
      setBrand(DEFAULT_BRAND);
      setChargement(false);
      return;
    }
    // Nouvelle session (connexion sans rechargement de page) : on repasse en
    // chargement, sinon le garde lirait la liste de l'écran de connexion. Pas
    // lors d'un rafraîchissement forcé — la page des paramètres resterait
    // montée derrière un écran d'attente pour rien.
    if (!force) setChargement(true);
    try {
      const settings = await companySettingsService.get(force);
      if (id !== requete.current) return;
      const liste = Array.isArray(settings?.modules_desactives) ? settings.modules_desactives : [];
      // Un module verrouillé reste actif même si la base contient sa clé :
      // masquer la facturation ou les utilisateurs rendrait l'ERP inutilisable.
      setModulesDesactives(liste.filter((k) => !MODULES_VERROUILLES.includes(k)));
      setBrand(buildBrand(settings));
      setTypeActivite(settings?.type_activite ?? 'general');
    } catch {
      if (id !== requete.current) return;
      // En cas d'échec on ne masque aucun module « au choix du client » : mieux
      // vaut un menu complet qu'un programme amputé parce qu'une requête de
      // paramètres a échoué. Les modules hors périmètre v1 gardent leur dernier
      // état connu — masqués si rien n'a jamais été chargé : une panne ne doit
      // pas ouvrir la paie ou la comptabilité. Le nom déjà connu est conservé.
      setModulesDesactives((prev) => prev.filter(estHorsV1));
    } finally {
      if (id === requete.current) setChargement(false);
    }
  }, [userId, changementDu]);

  useEffect(() => { void charger(); }, [charger]);

  const value = useMemo<ModulesContextValue>(() => {
    const desactives = new Set(modulesDesactives);
    return {
      modulesDesactives,
      chargement,
      typeActivite,
      estModuleActif: (key: string) => !desactives.has(key),
      estCheminActif: (path: string) => {
        const key = moduleForPath(path);
        return !key || !desactives.has(key);
      },
      rafraichir: () => charger(true),
    };
  }, [modulesDesactives, chargement, typeActivite, charger]);

  return (
    <ModulesContext.Provider value={value}>
      <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>
    </ModulesContext.Provider>
  );
}

export function useModules(): ModulesContextValue {
  const ctx = useContext(ModulesContext);
  if (!ctx) {
    // Hors provider (tests unitaires de pages isolées) : tout est actif.
    return {
      modulesDesactives: [],
      chargement: false,
      typeActivite: 'general',
      estModuleActif: () => true,
      estCheminActif: () => true,
      rafraichir: async () => {},
    };
  }
  return ctx;
}
