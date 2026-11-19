import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Numéro de pièce ou référence produit (« FAC-2026-00110 », « INF-MON-004 ») :
 * la signature de l'interface. Chiffres mono, comme le numéro imprimé sur un
 * carnet à souches — dans les listes, les fiches, la caisse, la recherche et
 * les cartes mobiles, et nulle part ailleurs. Jamais coupé à ses tirets.
 */
export function DocumentCode({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('whitespace-nowrap font-mono', className)}>{children}</span>;
}

/**
 * Codes de document (« FAC-2026-00110 », « DEM-2026-00002 ») : jamais coupés à
 * leurs tirets. À 390 px le titre « Facture FAC-2026-00110 » passait sur quatre
 * lignes, et « Décider de la demande DEM-2026- / 00002 » se lisait mal.
 */
const DOCUMENT_CODE = /([A-Z]{2,}(?:-[A-Z0-9]+)+)/g;

/** Texte dont chaque code de document reste d'un seul tenant (titres de page et de fenêtre). */
export function DocumentCodeText({ text }: { text: string }) {
  const parts = text.split(DOCUMENT_CODE);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="whitespace-nowrap">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}
