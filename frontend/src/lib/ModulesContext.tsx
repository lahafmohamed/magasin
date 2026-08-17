import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { companySettingsService } from '@/services/api';
import { moduleForPath, MODULES_VERROUILLES } from '@/config/modules';

interface ModulesContextValue {
  /** Clés des modules masqués par l'administrateur. */
  modulesDesactives: string[];
  /** Un module est actif tant qu'il n'est pas explicitement désactivé. */
  estModuleActif: (key: string) => boolean;
  /** Une route est accessible si le module qui la couvre est actif. */
  estCheminActif: (path: string) => boolean;
  /** Recharge depuis le serveur (après enregistrement des paramètres). */
  rafraichir: () => Promise<void>;
  chargement: boolean;
}

const ModulesContext = createContext<ModulesContextValue | null>(null);

export function ModulesProvider({ children }: { children: React.ReactNode }) {
  const [modulesDesactives, setModulesDesactives] = useState<string[]>([]);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async (force = false) => {
    // Pas de session : rien à charger, et l'appel renverrait 401.
    if (!localStorage.getItem('auth_user')) {
      setModulesDesactives([]);
      setChargement(false);
      return;
    }
    try {
      const settings = await companySettingsService.get(force);
      const liste = Array.isArray(settings?.modules_desactives) ? settings.modules_desactives : [];
      // Un module verrouillé reste actif même si la base contient sa clé :
      // masquer la facturation ou les utilisateurs rendrait l'ERP inutilisable.
      setModulesDesactives(liste.filter((k) => !MODULES_VERROUILLES.includes(k)));
    } catch {
      // En cas d'échec on n'masque rien : mieux vaut un menu complet qu'un
      // programme amputé parce qu'une requête de paramètres a échoué.
      setModulesDesactives([]);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  const value = useMemo<ModulesContextValue>(() => {
    const desactives = new Set(modulesDesactives);
    return {
      modulesDesactives,
      chargement,
      estModuleActif: (key: string) => !desactives.has(key),
      estCheminActif: (path: string) => {
        const key = moduleForPath(path);
        return !key || !desactives.has(key);
      },
      rafraichir: () => charger(true),
    };
  }, [modulesDesactives, chargement, charger]);

  return <ModulesContext.Provider value={value}>{children}</ModulesContext.Provider>;
}

export function useModules(): ModulesContextValue {
  const ctx = useContext(ModulesContext);
  if (!ctx) {
    // Hors provider (tests unitaires de pages isolées) : tout est actif.
    return {
      modulesDesactives: [],
      chargement: false,
      estModuleActif: () => true,
      estCheminActif: () => true,
      rafraichir: async () => {},
    };
  }
  return ctx;
}
