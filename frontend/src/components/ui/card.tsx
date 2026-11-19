import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Carte. Les rembourrages par défaut (16 px, 20 px dès 640 px) sont des classes
 * de composant définies dans index.css (`.card-header`, `.card-content`…) et non
 * des utilitaires responsives : un `p-0`, `pt-6` ou `pb-2` passé par la page
 * l'emporte donc à toutes les largeurs. Avec `p-4 pt-0 sm:p-6 sm:pt-0`,
 * tailwind-merge gardait le `sm:pt-0` et collait le contenu au bord supérieur
 * dès 640 px.
 */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // Filet seul : la carte se détache par son fond (blanc sur `canvas`),
      // pas par une ombre ajoutée au filet.
      "rounded-lg border bg-card text-card-foreground",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("card-header flex flex-col space-y-1", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

type CardTitleTag = "h2" | "h3" | "h4" | "p"

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /**
   * Niveau de titre. Défaut `h2` : la page porte le seul `h1` et ses cartes en
   * sont les sections. `h3` pour une carte imbriquée dans une section titrée.
   */
  as?: CardTitleTag
}

/**
 * Titre de section : 16 px, poids 500. L'ancien défaut (24 px) rivalisait avec le
 * titre de page (30 px) — 43 cartes le gardaient ; le 600 sur chaque carte
 * faisait du gras la règle plutôt que l'exception.
 */
const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, as: Tag = "h2", ...props }, ref) => (
    <Tag
      ref={ref}
      className={cn("text-base font-medium leading-snug", className)}
      {...props}
    />
  )
)
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

/**
 * Où se place le contenu dans la carte :
 * - `header` (défaut) : sous un `CardHeader`, sans marge haute ;
 * - `standalone` : carte sans en-tête (tuile, barre de filtres, bandeau) ;
 * - `flush` : aucun rembourrage (tableau pleine largeur, liste à bords francs).
 */
export type CardContentInset = "header" | "standalone" | "flush"

const CONTENT_INSET: Record<CardContentInset, string> = {
  header: "card-content",
  standalone: "card-content-standalone",
  flush: "p-0",
}

export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  inset?: CardContentInset
}

const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, inset = "header", ...props }, ref) => (
    <div ref={ref} className={cn(CONTENT_INSET[inset], className)} {...props} />
  )
)
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("card-footer flex items-center", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
