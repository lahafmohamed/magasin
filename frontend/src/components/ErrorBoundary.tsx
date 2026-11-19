import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/ui/page-shell';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Filet de sécurité d'affichage. Le message technique de l'erreur (en anglais,
 * « Cannot read properties of undefined… ») part dans la console, jamais à
 * l'écran : l'utilisateur lit ce qui s'est passé et quoi faire.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <PageShell title="Cette page a rencontré un problème" width="narrow">
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-danger-200 bg-danger-50 p-4 text-danger-800"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="text-sm">
              Rechargez la page. Si le problème revient, prévenez votre administrateur.
            </p>
          </div>
          <Button
            type="button"
            className="gap-2"
            onClick={() => {
              this.setState({ hasError: false });
              window.location.reload();
            }}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Recharger la page
          </Button>
        </PageShell>
      );
    }

    return this.props.children;
  }
}
