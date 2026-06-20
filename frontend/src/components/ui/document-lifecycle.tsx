import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DocumentLifecycleStep {
  label: string;
  numero?: string | null;
  to?: string | null;
  current?: boolean;
}

interface DocumentLifecycleProps {
  steps: DocumentLifecycleStep[];
  className?: string;
}

export function DocumentLifecycle({ steps, className }: DocumentLifecycleProps) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <div className="flex items-stretch gap-1 min-w-max">
        {steps.map((step, idx) => {
          const hasDoc = !!step.numero;
          const isLink = hasDoc && !!step.to && !step.current;

          const pill = (
            <div
              className={cn(
                'flex flex-col items-start justify-center rounded-lg border px-3 py-1.5 min-w-[100px] transition-colors',
                step.current && 'border-primary bg-primary/5 font-semibold',
                !hasDoc && 'border-dashed text-muted-foreground',
                isLink && 'border-border text-primary hover:underline hover:bg-accent',
                hasDoc && !isLink && !step.current && 'border-border'
              )}
            >
              <span className="text-[11px] uppercase tracking-wide opacity-70">{step.label}</span>
              <span className="text-sm font-medium leading-tight">
                {hasDoc ? step.numero : '—'}
              </span>
            </div>
          );

          return (
            <Fragment key={idx}>
              {idx > 0 && (
                <ChevronRight className="h-4 w-4 self-center text-muted-foreground flex-shrink-0" />
              )}
              {isLink ? (
                <Link to={step.to as string} className="no-underline">
                  {pill}
                </Link>
              ) : (
                pill
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
