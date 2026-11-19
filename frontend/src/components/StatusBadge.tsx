import type { LucideIcon } from 'lucide-react';
import {
  CircleArrowRight,
  CircleCheck,
  CircleX,
  Clock,
  Lock,
  LockOpen,
  PackageCheck,
  PencilLine,
  Send,
  Truck,
  Undo2,
} from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * SOURCE UNIQUE des mots de statut (un mot par état, glossaire du brief §4 et
 * copy.md CP-S06). Pastilles, puces de filtre, listes déroulantes et barre de
 * paiement lisent ce fichier : `getStatusOptions('facture')` pour construire les
 * filtres, `getStatusLabel('devis', code)` pour un texte, `<StatusBadge>` pour
 * la pastille. Ne pas redéfinir de carte locale dans une page.
 *
 * Le statut ne repose jamais sur la couleur seule : le mot est toujours écrit.
 * L'icône ne s'affiche que sur la pastille d'en-tête (`size="md"`) — dans une
 * liste, une icône par ligne répétait le mot ; et l'état final de routine
 * (`settled` : « Payée », « Reçue »…) y est un simple texte discret — la
 * pastille est réservée à ce qui attend quelque chose. Un document annulé est neutre
 * (état final, pas une erreur) ; un refus reste rouge. Familles d'icônes : CircleCheck (fait / validé), Clock (en attente), CircleX
 * (annulé / refusé), PencilLine (brouillon), CircleArrowRight (transformé en un
 * autre document / terminé), plus Truck, PackageCheck, Send, Lock, LockOpen,
 * Undo2 pour les étapes logistiques et de caisse.
 */
export interface StatusConfig {
  label: string;
  variant: BadgeVariant;
  icon?: LucideIcon;
  /** Explication d'une phrase (fiche détail, infobulle). */
  description?: string;
  /**
   * État final de routine (« Payée », « Reçue ») : rien à faire, rien à
   * surveiller. Dans une liste (`size="sm"`) il s'écrit en texte discret,
   * sans pastille — sinon la pastille verte couvre les trois quarts des lignes
   * et celles qui attendent quelque chose ne ressortent plus. La pastille
   * d'en-tête (`md`) est inchangée.
   */
  settled?: boolean;
}

const DONE = CircleCheck;
const WAIT = Clock;
const STOP = CircleX;
const DRAFT = PencilLine;
const NEXT = CircleArrowRight;

/** Codes = valeurs des contraintes CHECK / ENUM de la base (ci-baseline.sql). */
const STATUS_CONFIG = {
  facture: {
    en_attente: { label: 'Non payée', variant: 'warning', icon: WAIT },
    partielle: { label: 'Partiellement payée', variant: 'info', icon: WAIT },
    payee: { label: 'Payée', variant: 'success', icon: DONE, settled: true },
    annulee: { label: 'Annulée', variant: 'secondary', icon: STOP },
  },
  devis: {
    brouillon: { label: 'Brouillon', variant: 'secondary', icon: DRAFT },
    envoye: { label: 'Envoyé', variant: 'info', icon: Send },
    accepte: { label: 'Confirmé', variant: 'success', icon: DONE },
    converti: { label: 'Facturé', variant: 'secondary', icon: NEXT },
    refuse: { label: 'Refusé', variant: 'destructive', icon: STOP },
    annule: { label: 'Annulé', variant: 'secondary', icon: STOP },
  },
  bl: {
    brouillon: { label: 'Brouillon', variant: 'secondary', icon: DRAFT },
    valide: { label: 'À livrer', variant: 'warning', icon: WAIT },
    livre: { label: 'Livré', variant: 'success', icon: DONE },
    facture: { label: 'Facturé', variant: 'secondary', icon: NEXT },
    annule: { label: 'Annulé', variant: 'secondary', icon: STOP },
  },
  avoir: {
    brouillon: { label: 'Brouillon', variant: 'secondary', icon: DRAFT },
    // Ancien code encore présent dans d'anciennes données.
    en_attente: { label: 'En attente', variant: 'warning', icon: WAIT },
    valide: { label: 'Validé', variant: 'success', icon: DONE },
    utilise: { label: 'Utilisé', variant: 'secondary', icon: NEXT },
    annule: { label: 'Annulé', variant: 'secondary', icon: STOP },
  },
  retour: {
    en_attente: { label: 'En attente', variant: 'warning', icon: WAIT },
    traite: { label: 'Approuvé', variant: 'success', icon: DONE, settled: true },
    annule: { label: 'Annulé', variant: 'secondary', icon: STOP },
  },
  commande: {
    en_attente: { label: 'En attente', variant: 'warning', icon: WAIT },
    validee: { label: 'Validée', variant: 'info', icon: DONE },
    expediee: { label: 'Expédiée', variant: 'info', icon: Truck },
    livree: { label: 'Reçue', variant: 'success', icon: PackageCheck, settled: true },
    annulee: { label: 'Annulée', variant: 'secondary', icon: STOP },
  },
  facture_fournisseur: {
    en_attente: { label: 'En attente', variant: 'warning', icon: WAIT },
    validee: { label: 'Validée', variant: 'info', icon: DONE },
    partiellement_payee: { label: 'Partiellement payée', variant: 'info', icon: WAIT },
    payee: { label: 'Payée', variant: 'success', icon: DONE, settled: true },
    annulee: { label: 'Annulée', variant: 'secondary', icon: STOP },
  },
  transfert: {
    en_preparation: { label: 'En préparation', variant: 'warning', icon: WAIT },
    en_cours: { label: 'En cours de livraison', variant: 'info', icon: Truck },
    livre: { label: 'Livré', variant: 'success', icon: PackageCheck, settled: true },
    annule: { label: 'Annulé', variant: 'secondary', icon: STOP },
  },
  inventaire: {
    en_cours: { label: 'En cours', variant: 'warning', icon: WAIT },
    valide: { label: 'Validé', variant: 'success', icon: DONE, settled: true },
    annule: { label: 'Annulé', variant: 'secondary', icon: STOP },
  },
  demande: {
    brouillon: {
      label: 'Brouillon', variant: 'secondary', icon: DRAFT,
      description: 'La demande est en cours de rédaction, visible uniquement par le magasin.',
    },
    envoyee: {
      label: 'Envoyée', variant: 'warning', icon: Send,
      description: 'La demande a été envoyée au dépôt et attend une décision.',
    },
    approuvee: {
      label: 'Approuvée', variant: 'info', icon: DONE,
      description: 'Le dépôt a approuvé toutes les quantités demandées.',
    },
    partiellement_approuvee: {
      label: 'Partiellement approuvée', variant: 'info', icon: DONE,
      description: 'Le dépôt a approuvé une partie des quantités demandées.',
    },
    refusee: {
      label: 'Refusée', variant: 'destructive', icon: STOP,
      description: 'Le dépôt a refusé la demande.',
    },
    en_cours: {
      label: 'En cours de livraison', variant: 'info', icon: Truck,
      description: 'Le transfert est créé : le stock quitte le dépôt pour le magasin.',
    },
    livree: {
      label: 'Livrée', variant: 'success', icon: PackageCheck,
      description: 'Le stock est arrivé au magasin, qui doit confirmer la réception.',
    },
    cloturee: {
      label: 'Clôturée', variant: 'secondary', icon: NEXT,
      description: 'Le magasin a confirmé la réception. Demande terminée.',
    },
  },
  paie: {
    brouillon: { label: 'Brouillon', variant: 'secondary', icon: DRAFT },
    valide: { label: 'Validé', variant: 'info', icon: DONE },
    paye: { label: 'Payé', variant: 'success', icon: DONE, settled: true },
    annule: { label: 'Annulé', variant: 'secondary', icon: STOP },
  },
  bulletin: {
    en_attente: { label: 'En attente', variant: 'warning', icon: WAIT },
    paye: { label: 'Payé', variant: 'success', icon: DONE, settled: true },
  },
  session_caisse: {
    ouverte: { label: 'Ouverte', variant: 'success', icon: LockOpen },
    cloturee: { label: 'Clôturée', variant: 'secondary', icon: Lock },
  },
  periode: {
    ouverte: { label: 'Ouverte', variant: 'success', icon: LockOpen },
    fermee: { label: 'Fermée', variant: 'secondary', icon: Lock },
  },
  acompte: {
    disponible: { label: 'Disponible', variant: 'success', icon: DONE },
    partiellement_utilise: { label: 'Partiellement utilisé', variant: 'info', icon: WAIT },
    utilise: { label: 'Utilisé', variant: 'secondary', icon: NEXT },
    rembourse: { label: 'Remboursé', variant: 'secondary', icon: Undo2 },
  },
  commission: {
    en_attente: { label: 'En attente', variant: 'warning', icon: WAIT },
    validee: { label: 'Validée', variant: 'info', icon: DONE },
    payee: { label: 'Payée', variant: 'success', icon: DONE, settled: true },
  },
  /** Employé ou compte utilisateur : passer `statut={actif ? 'actif' : 'inactif'}`. */
  compte: {
    actif: { label: 'Actif', variant: 'success', icon: DONE },
    inactif: { label: 'Inactif', variant: 'secondary', icon: STOP },
  },
} satisfies Record<string, Record<string, StatusConfig>>;

/** Type de document / d'objet couvert par la carte des statuts. */
export type StatusDocumentType = keyof typeof STATUS_CONFIG;
/** @deprecated alias historique de `StatusDocumentType`. */
export type DocumentType = StatusDocumentType;
/** Codes de statut connus pour un type (`StatusCode<'facture'>` = 'en_attente' | 'partielle' | …). */
export type StatusCode<T extends StatusDocumentType> = keyof (typeof STATUS_CONFIG)[T] & string;

/** « en_preparation » → « En preparation » : jamais le code brut à l'écran. */
export function humanizeStatus(code: string | null | undefined): string {
  if (!code) return 'Statut inconnu';
  const readable = code.replace(/_/g, ' ').trim();
  return readable ? readable.charAt(0).toLocaleUpperCase('fr-FR') + readable.slice(1) : 'Statut inconnu';
}

/**
 * Configuration d'un statut. Code inconnu → libellé lisible (variante `outline`,
 * sans icône) plutôt que le code brut.
 */
export function getStatusConfig(type: StatusDocumentType, code: string | null | undefined): StatusConfig {
  const map = STATUS_CONFIG[type] as Record<string, StatusConfig> | undefined;
  const known = code ? map?.[code] : undefined;
  return known ?? { label: humanizeStatus(code), variant: 'outline' };
}

/** Libellé français d'un statut (texte, export, toast). */
export function getStatusLabel(type: StatusDocumentType, code: string | null | undefined): string {
  return getStatusConfig(type, code).label;
}

/** Explication d'une phrase du statut, si elle existe (demandes). */
export function getStatusDescription(type: StatusDocumentType, code: string | null | undefined): string | undefined {
  return getStatusConfig(type, code).description;
}

export interface StatusOption<T extends string = string> {
  value: T;
  label: string;
}

/**
 * Options de filtre (puces, `<Select>`) dans l'ordre du cycle de vie, avec le
 * même libellé que la pastille.
 *
 *   const chips = [{ value: 'all', label: 'Toutes' }, ...getStatusOptions('facture')];
 *   getStatusOptions('devis', { exclude: ['annule'] })
 */
export function getStatusOptions<T extends StatusDocumentType>(
  type: T,
  opts: { only?: readonly string[]; exclude?: readonly string[] } = {}
): StatusOption<StatusCode<T>>[] {
  const map = STATUS_CONFIG[type] as Record<string, StatusConfig>;
  return Object.entries(map)
    .filter(([code]) => (!opts.only || opts.only.includes(code)) && !opts.exclude?.includes(code))
    .map(([code, cfg]) => ({ value: code as StatusCode<T>, label: cfg.label }));
}

interface StatusBadgeProps {
  type: StatusDocumentType;
  statut: string | null | undefined;
  /** `md` dans un en-tête de page, `sm` (défaut) dans une liste. */
  size?: 'sm' | 'md';
  className?: string;
}

export function StatusBadge({ type, statut, size = 'sm', className }: StatusBadgeProps) {
  const config = getStatusConfig(type, statut);
  if (size === 'sm' && config.settled) {
    // Même boîte que la pastille `sm` (12 px / 16 px, 2 px de marge et 1 px de
    // bord en haut et en bas) : les lignes gardent toutes la même hauteur.
    return (
      <span
        className={cn(
          'inline-flex whitespace-nowrap border border-transparent py-0.5 text-xs leading-4 text-muted-foreground',
          className
        )}
      >
        {config.label}
      </span>
    );
  }
  return (
    <Badge variant={config.variant} size={size} icon={size === 'md' ? config.icon : undefined} className={className}>
      {config.label}
    </Badge>
  );
}

export default StatusBadge;
