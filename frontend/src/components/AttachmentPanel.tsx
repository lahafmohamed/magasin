import { useCallback, useEffect, useRef, useState } from 'react';
import { attachmentService } from '../services/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QueryState } from '@/components/ui/query-state';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/loading';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { getErrorMessage } from '@/utils/errors';
import { Paperclip, Upload, Download, Trash2, FileText } from 'lucide-react';

interface Attachment {
  id: number;
  filename: string;
  mime_type: string;
  taille: number;
  created_at: string;
  cree_par_nom?: string | null;
}

const fmtSize = (b: number) => (b < 1024 ? `${b} o` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} Ko` : `${(b / 1024 / 1024).toFixed(1)} Mo`);

export function AttachmentPanel({ entityType, entityId }: { entityType: string; entityId: number }) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();

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
      toast.success('Pièce jointe ajoutée');
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Erreur lors de l'envoi"));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDelete = async (attachment: Attachment) => {
    const ok = await confirm({
      title: 'Supprimer la pièce jointe ?',
      description: `« ${attachment.filename} » sera définitivement supprimée. Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      destructive: true,
    });
    if (!ok) return;
    try {
      await attachmentService.remove(attachment.id);
      setItems((it) => it.filter((a) => a.id !== attachment.id));
      toast.success('Pièce jointe supprimée');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Suppression impossible'));
    }
  };

  return (
    <Card className="no-print">
      <CardHeader className="pb-3 flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Paperclip className="h-4 w-4" /> Pièces jointes {items.length > 0 && <span className="text-muted-foreground">({items.length})</span>}
        </CardTitle>
        <>
          <input ref={inputRef} type="file" className="hidden" onChange={onFile}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.xls,.docx,.doc,.csv,.txt" />
          <Button size="sm" variant="outline" className="gap-1" disabled={uploading} aria-busy={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? <Spinner /> : <Upload className="h-4 w-4" aria-hidden="true" />} Ajouter
          </Button>
        </>
      </CardHeader>
      <CardContent>
        <QueryState
          loading={loading}
          error={error}
          onRetry={load}
          isEmpty={items.length === 0}
          skeleton={<ListSkeleton items={2} />}
          emptyTitle="Aucune pièce jointe"
          emptyDescription="Ajoutez un devis signé, un bon de commande ou un justificatif."
          emptyIcon={Paperclip}
        >
          <ul className="divide-y">
            {items.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate" title={a.filename}>{a.filename}</p>
                  <p className="text-xs text-muted-foreground">{fmtSize(a.taille)} · {new Date(a.created_at).toLocaleDateString('fr-FR')}{a.cree_par_nom ? ` · ${a.cree_par_nom}` : ''}</p>
                </div>
                <Button size="icon" variant="ghost" aria-label={`Télécharger ${a.filename}`} title="Télécharger" onClick={() => attachmentService.download(a.id, a.filename)}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button size="icon" variant="ghost" aria-label={`Supprimer ${a.filename}`} title="Supprimer" onClick={() => onDelete(a)}>
                  <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        </QueryState>
      </CardContent>
    </Card>
  );
}
