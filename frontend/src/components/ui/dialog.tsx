import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { DocumentCodeText } from "@/components/ui/document-code"
import { useCaptureOpener, useFocusReturn } from "@/components/ui/focus-return"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

/**
 * Mémorise l'élément qui avait le focus à l'ouverture, pour le lui rendre à la
 * fermeture (`useFocusReturn`). À placer en premier enfant d'un
 * `DialogPrimitive.Content` : il n'est monté qu'à l'ouverture. `DialogContent`
 * et `SheetContent` le font déjà ; seul un contenu Radix monté à la main (tiroir
 * de navigation) en a besoin.
 */
function FocusReturnCapture({ opener }: { opener: React.MutableRefObject<HTMLElement | null> }) {
  useCaptureOpener(opener)
  return null
}

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

/**
 * Fenêtre modale.
 *
 * - Focus : à la fermeture, il revient à l'élément qui l'avait à l'ouverture
 *   (ou au bouton du menu d'où elle est partie), sinon au titre de la page.
 *   Un `onCloseAutoFocus` qui appelle `event.preventDefault()` garde la main.
 * - Piste unique `minmax(0, 1fr)` : un tableau sans retour à la ligne défile
 *   dans sa région au lieu d'élargir toute la fenêtre hors de son cadre.
 * - `scroll-padding-bottom` : un champ atteint au clavier ne s'arrête pas sous
 *   un pied de fenêtre collant (`<DialogFooter sticky>`).
 */
const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onCloseAutoFocus, ...props }, ref) => {
  const focusReturn = useFocusReturn(onCloseAutoFocus)
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] grid-cols-[minmax(0,1fr)] sm:w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-popover text-popover-foreground p-4 sm:p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-lg sm:rounded-lg max-h-[90vh] overflow-y-auto scroll-pb-36",
          className
        )}
        onCloseAutoFocus={focusReturn.onCloseAutoFocus}
        {...props}
      >
        <FocusReturnCapture opener={focusReturn.opener} />
        {children}
        {/* Cible de 36 px (l'icône de 16 px seule passait sous le minimum de 24 px). */}
        <DialogPrimitive.Close className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground ring-offset-background transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none sm:right-3 sm:top-3">
          <X className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Fermer</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

/** `pe-8` : le titre passe à la ligne avant le bouton « Fermer » au lieu de s'y heurter. */
const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 pe-8 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

interface DialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Pied collé en bas de la fenêtre pendant le défilement : l'action reste
   * visible dans une fenêtre longue (clôture de caisse, paiement sur
   * téléphone). Dernier enfant de `DialogContent`, dont il reprend les marges.
   */
  sticky?: boolean
}

/**
 * `-bottom-4 sm:-bottom-6` (M-A) : la limite d'un élément collant se mesure
 * depuis la boîte de contenu de la fenêtre, padding exclu. Avec `bottom-0`, le
 * pied remontait de tout le padding (24 px) même sans défilement et
 * recouvrait de 8 px le dernier champ (« Notes », « Commentaire »).
 */
const DialogFooter = ({
  className,
  sticky = false,
  ...props
}: DialogFooterProps) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      sticky &&
        "sticky -bottom-4 z-10 -mx-4 -mb-4 border-t bg-popover px-4 py-3 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

/**
 * Titre de la fenêtre. Un titre texte garde ses codes de document d'un seul
 * tenant ; interligne serré mais lisible quand il passe sur deux lignes.
 */
const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-tight tracking-tight",
      className
    )}
    {...props}
  >
    {typeof children === "string" ? <DocumentCodeText text={children} /> : children}
  </DialogPrimitive.Title>
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  FocusReturnCapture,
}
