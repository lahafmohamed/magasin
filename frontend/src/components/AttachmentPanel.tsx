import { useEffect, useRef, useState } from 'react';
import { attachmentService } from '../services/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Paperclip, Upload, Download, Trash2, Loader2, FileText } from 'lucide-react';

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
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await attachmentService.list(entityType, entityId));
    } catch {
      // silent — panel stays empty
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (entityId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await attachmentService.upload(entityType, entityId, file);
      toast.success('Pièce jointe ajoutée');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erreur lors de l\'envoi');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDelete = async (id: number) => {
    try {
      await attachmentService.remove(id);
      setItems((it) => it.filter((a) => a.id !== id));
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Suppression impossible');
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
          <Button size="sm" variant="outline" className="gap-1" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Ajouter
          </Button>
        </>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune pièce jointe.</p>
        ) : (
          <ul className="divide-y">
            {items.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{a.filename}</p>
                  <p className="text-xs text-muted-foreground">{fmtSize(a.taille)} · {new Date(a.created_at).toLocaleDateString('fr-FR')}{a.cree_par_nom ? ` · ${a.cree_par_nom}` : ''}</p>
                </div>
                <Button size="icon" variant="ghost" title="Télécharger" onClick={() => attachmentService.download(a.id, a.filename)}>
                  <Download className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" title="Supprimer" onClick={() => onDelete(a.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
