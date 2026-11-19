import * as React from "react"
import { cn } from "@/lib/utils"
import { scrollFadeClass, useScrollEdges } from "@/components/ui/scroll-edges"

export interface ScrollRegionProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Nom du contenu défilant (« Mouvements de la session »), repris par la région. */
  label?: string
}

/**
 * Conteneur à défilement horizontal accessible au clavier : tant que son contenu
 * déborde, il devient une région focusable et nommée (WCAG 2.1.1, règle axe
 * `scrollable-region-focusable`) ; sinon c'est une simple `<div>`, sans arrêt de
 * tabulation. À utiliser à la place d'un `<div className="overflow-x-auto">`
 * fait main autour d'un tableau ou d'une bande défilante.
 *
 * Tant qu'il reste du contenu caché, le bord concerné s'estompe : une colonne
 * coupée se voit coupée (« −44 » ne se lit plus comme un montant entier
 * quand « −440 FCFA » dépasse du cadre).
 */
const ScrollRegion = React.forwardRef<HTMLDivElement, ScrollRegionProps>(
  ({ label, className, children, ...props }, ref) => {
    const wrapRef = React.useRef<HTMLDivElement>(null)
    React.useImperativeHandle(ref, () => wrapRef.current as HTMLDivElement)
    // Focusable seulement quand il défile vraiment : pas d'arrêt de tabulation
    // inutile sur un tableau qui tient à l'écran.
    const edges = useScrollEdges(wrapRef)
    const { overflowing } = edges
    return (
      <div
        ref={wrapRef}
        className={cn(
          "relative w-full overflow-auto rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          scrollFadeClass(edges),
          className
        )}
        {...(overflowing
          ? {
              tabIndex: 0,
              role: "region",
              "aria-label": label ? `${label} (défilement horizontal)` : "Contenu (défilement horizontal)",
            }
          : {})}
        {...props}
      >
        {children}
      </div>
    )
  }
)
ScrollRegion.displayName = "ScrollRegion"

export interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /** Classes du conteneur défilant (bordure, arrondi…), distinctes de celles du `<table>`. */
  containerClassName?: string
}

/**
 * Tableau dans un `ScrollRegion` : quand il déborde (téléphone), son conteneur
 * devient une région focusable et nommée, défilable au clavier. Nommer le
 * tableau avec `aria-label` (« Lignes de la facture ») : la région reprend ce nom.
 */
const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, containerClassName, ...props }, ref) => (
    <ScrollRegion label={props["aria-label"] ?? "Tableau"} className={containerClassName}>
      <table
        ref={ref}
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </ScrollRegion>
  )
)
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  // Pas de `sticky top-0` : à l'intérieur du conteneur `overflow-auto` il ne
  // collait jamais à la fenêtre, et son fond `bg-background` dessinait une bande
  // plus sombre que la carte en thème sombre.
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      // Pas de `transition-colors` ici : le survol de ligne est une interaction
      // haute fréquence, il doit être instantané.
      "border-b hover:bg-muted/50 data-[state=selected]:bg-muted",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

export interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  /** Colonne de montants / quantités : en-tête aligné à droite, comme ses cellules. */
  numeric?: boolean
}

/**
 * En-tête de colonne : jamais sur deux lignes (« Qté commandée * » s'étalait sur
 * trois). Le style est unique — pas d'en-têtes en capitales ailleurs.
 */
const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, numeric, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-10 whitespace-nowrap px-3 text-left align-middle text-xs font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
        numeric && "text-right",
        className
      )}
      {...props}
    />
  )
)
TableHead.displayName = "TableHead"

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  /**
   * Montant / quantité : aligné à droite, chiffres tabulaires, jamais coupé.
   * `tabular-nums` n'est plus posé sur toutes les cellules : la fonte Inter
   * donne alors au trait d'union une chasse de chiffre (« Jean - Pierre »).
   */
  numeric?: boolean
}

const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, numeric, ...props }, ref) => (
    <td
      ref={ref}
      className={cn(
        "px-3 py-2.5 align-middle text-sm [&:has([role=checkbox])]:pr-0",
        numeric && "whitespace-nowrap text-right tabular-nums",
        className
      )}
      {...props}
    />
  )
)
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  ScrollRegion,
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
