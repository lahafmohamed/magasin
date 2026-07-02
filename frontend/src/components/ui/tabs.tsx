import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Onglets accessibles (style « souligné »), sans dépendance externe.
 * API identique à shadcn/ui : <Tabs value onValueChange> + TabsList /
 * TabsTrigger / TabsContent. Le contenu inactif est démonté (rendu paresseux),
 * navigation clavier ←/→/Début/Fin sur la liste (activation automatique).
 *
 *   <Tabs value={tab} onValueChange={(v) => setTab(v as MyTab)}>
 *     <TabsList>
 *       <TabsTrigger value="a">Onglet A</TabsTrigger>
 *       <TabsTrigger value="b">Onglet B</TabsTrigger>
 *     </TabsList>
 *     <TabsContent value="a">…</TabsContent>
 *     <TabsContent value="b">…</TabsContent>
 *   </Tabs>
 */

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
  baseId: string;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error(`<${component}> doit être utilisé à l'intérieur de <Tabs>`);
  }
  return context;
}

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Valeur contrôlée de l'onglet actif. */
  value?: string;
  /** Valeur initiale en mode non contrôlé. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ value, defaultValue, onValueChange, className, ...props }, ref) => {
    const [internalValue, setInternalValue] = React.useState(defaultValue ?? '');
    const isControlled = value !== undefined;
    const currentValue = isControlled ? value : internalValue;
    const baseId = React.useId();

    const setValue = React.useCallback(
      (next: string) => {
        if (!isControlled) setInternalValue(next);
        onValueChange?.(next);
      },
      [isControlled, onValueChange]
    );

    const context = React.useMemo(
      () => ({ value: currentValue, setValue, baseId }),
      [currentValue, setValue, baseId]
    );

    return (
      <TabsContext.Provider value={context}>
        <div ref={ref} className={className} {...props} />
      </TabsContext.Provider>
    );
  }
);
Tabs.displayName = 'Tabs';

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, onKeyDown, ...props }, ref) => {
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

      const tabs = Array.from(
        event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])')
      );
      const currentIndex = tabs.indexOf(document.activeElement as HTMLButtonElement);
      if (tabs.length === 0 || currentIndex === -1) return;

      event.preventDefault();
      let nextIndex: number;
      if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      else if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
      else if (event.key === 'Home') nextIndex = 0;
      else nextIndex = tabs.length - 1;

      tabs[nextIndex].focus();
      tabs[nextIndex].click();
    };

    return (
      <div
        ref={ref}
        role="tablist"
        className={cn('flex gap-1 overflow-x-auto border-b', className)}
        onKeyDown={handleKeyDown}
        {...props}
      />
    );
  }
);
TabsList.displayName = 'TabsList';

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ value, className, onClick, ...props }, ref) => {
    const { value: selectedValue, setValue, baseId } = useTabsContext('TabsTrigger');
    const isSelected = selectedValue === value;

    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        id={`${baseId}-trigger-${value}`}
        aria-selected={isSelected}
        aria-controls={`${baseId}-content-${value}`}
        tabIndex={isSelected ? 0 : -1}
        data-state={isSelected ? 'active' : 'inactive'}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) setValue(value);
        }}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2 text-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          isSelected
            ? 'border-primary text-primary font-medium'
            : 'border-transparent text-muted-foreground hover:text-foreground',
          className
        )}
        {...props}
      />
    );
  }
);
TabsTrigger.displayName = 'TabsTrigger';

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ value, className, ...props }, ref) => {
    const { value: selectedValue, baseId } = useTabsContext('TabsContent');
    if (selectedValue !== value) return null;

    return (
      <div
        ref={ref}
        role="tabpanel"
        id={`${baseId}-content-${value}`}
        aria-labelledby={`${baseId}-trigger-${value}`}
        tabIndex={0}
        className={cn('focus-visible:outline-none', className)}
        {...props}
      />
    );
  }
);
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsList, TabsTrigger, TabsContent };
