import { useCallback, useEffect, useRef, useState } from 'react';
import { attachmentService } from '../services/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QueryState } from '@/components/ui/query-state';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/loading';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useOptionalAuth } from '@/lib/AuthContext';
import { getErrorMessage } from '@/utils/errors';
import { formatDate, formatFileSize } from '@/utils/format';
import { Paperclip, Upload, Download, Trash2, FileText } from 'lucide-react';

interface Attachment {
  id: number;
  filename: string;
  mime_type: string;
  taille: number;
  created_at: string;
  cree_par_nom?: string | null;
}

/** Rôles autorisés par l'API à supprimer une pièce jointe (`DELETE /attachments/:id`). */
const DELETE_ROLES = ['admin', 'manager'];

export function AttachmentPanel({ entityType, entityId }: { entityType: string; entityId: number }) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const role = useOptionalAuth()?.user?.role;
  const canDelete = !!role && DELETE_ROLES.includes(role);

  const load = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await attachmentService.list(entityType, entityId));
    } catch (err) {
      setError(err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await attachmentService.upload(entityType, entityId, file);
      toast.success(`Pièce jointe « ${file.name} » ajoutée`);
      load();
    } catch (err) {
      toast.error(
        getErrorMessage(err, 'Impossible d’envoyer le fichier. Vérifiez sa taille et son format, puis réessayez.')
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDelete = async (attachment: Attachment) => {
    const ok = await confirm({
      title: 'Supprimer la pièce jointe ?',
      description: `« ${attachment.filename} » sera retirée de ce document et supprimée définitivement.`,
      confirmLabel: 'Supprimer la pièce jointe',
      destructive: true,
    });
    if (!ok) return;
    try {
      await attachmentService.remove(attachment.id);
      setItems((it) => it.filter((a) => a.id !== attachment.id));
      toast.success('Pièce jointe supprimée');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de supprimer la pièce jointe. Réessayez.'));
    }
  };

  return (
    <Card className="no-print">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2">
          Pièces jointes
          {items.length > 0 && <span className="font-normal text-muted-foreground tabular-nums">({items.length})</span>}
        </CardTitle>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onFile}
          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.xls,.docx,.doc,.csv,.txt"
        />
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={uploading}
          aria-busy={uploading || undefined}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Spinner /> : <Upload className="h-4 w-4" aria-hidden="true" />}
          Joindre un fichier
        </Button>
      </CardHeader>
      <CardContent>
        <QueryState
          loading={loading}
          error={error}
          onRetry={load}
          errorTitle="Impossible de charger les pièces jointes"
          isEmpty={items.length === 0}
          skeleton={<ListSkeleton items={2} />}
          emptyTitle="Aucune pièce jointe"
          emptyDescription="Joignez un devis signé, un bon de commande ou un justificatif"
          emptyIcon={Paperclip}
          className="py-6"
        >
          <ul className="divide-y">
            {items.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm" title={a.filename}>
                    {a.filename}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(a.taille)} · {formatDate(a.created_at)}
                    {a.cree_par_nom ? ` · ${a.cree_par_nom}` : ''}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Télécharger ${a.filename}`}
                  title="Télécharger"
                  onClick={() =>
                    attachmentService
                      .download(a.id, a.filename)
                      .catch((err) =>
                        toast.error(getErrorMessage(err, 'Impossible de télécharger le fichier. Réessayez.'))
                      )
                  }
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                </Button>
                {canDelete && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:bg-danger-50 hover:text-danger-700"
                    aria-label={`Supprimer ${a.filename}`}
                    title="Supprimer la pièce jointe"
                    onClick={() => onDelete(a)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </QueryState>
      </CardContent>
    </Card>
  );
}
