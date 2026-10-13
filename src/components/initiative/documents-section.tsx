'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileText, Paperclip, Trash2 } from 'lucide-react';
import type { AttachmentView } from '@/server/services/views';
import { removeAttachmentAction } from '@/server/actions/initiatives';
import { ActionError, useAction } from '@/lib/use-action';
import { toast } from '@/lib/toast';
import { Label } from '@/components/ui/primitives';
import { cn, formatDateTime } from '@/lib/utils';

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Documentos de la iniciativa (PDF o Word). Sirven para describirla en detalle
 * o dejar material de apoyo. La subida va por un Route Handler; el tipo real se
 * comprueba en el servidor por los bytes, no por la extensión.
 */
export function DocumentsSection({
  initiativeId,
  attachments,
  currentUserId,
  canManageAll,
  disabled,
}: {
  initiativeId: string;
  attachments: AttachmentView[];
  currentUserId: string;
  /** Responsable del área propietaria o Dirección: pueden retirar cualquier documento. */
  canManageAll: boolean;
  disabled: boolean;
}) {
  const router = useRouter();
  const remove = useAction(removeAttachmentAction, { success: 'Documento retirado' });
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const upload = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setError(null);
    if (!/\.(pdf|docx)$/i.test(file.name)) return setError('Solo se admiten documentos PDF o Word (.docx).');
    if (file.size > MAX_BYTES) return setError('El archivo supera 4 MB.');

    setUploading(true);
    try {
      const body = new FormData();
      body.set('file', file);
      const response = await fetch(`/api/initiatives/${initiativeId}/attachments`, { method: 'POST', body });
      const result = (await response.json().catch(() => null)) as { ok: boolean; message?: string } | null;
      if (!response.ok || !result?.ok) {
        setError(result?.message ?? 'No se pudo subir el documento. Inténtalo de nuevo.');
        return;
      }
      toast('Documento adjuntado');
      router.refresh();
    } catch {
      setError('No se pudo subir el documento. Comprueba la conexión.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <Label>Documentos</Label>

      {attachments.length === 0 ? (
        <p className="text-xs text-fg-muted">Sin documentos. Adjunta un PDF o Word que describa la iniciativa o ayude al equipo.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex items-center gap-2.5 px-3 py-2">
              <FileText aria-hidden className="size-3.5 shrink-0 text-fg-subtle" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg [overflow-wrap:anywhere]">{attachment.fileName}</p>
                <p className="text-xs text-fg-subtle">
                  <span className="tabular-nums">{formatSize(attachment.sizeBytes)}</span> · {attachment.uploadedBy?.name ?? '—'} ·{' '}
                  {formatDateTime(attachment.uploadedAt)}
                </p>
              </div>
              {/* Descarga por la ruta del servidor: el almacén es privado. */}
              <a
                href={`/api/attachments/${attachment.id}`}
                download
                className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                aria-label={`Descargar ${attachment.fileName}`}
                title="Descargar"
              >
                <Download className="size-3.5" />
              </a>
              {!disabled && (canManageAll || attachment.uploadedById === currentUserId) ? (
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => remove.run({ attachmentId: attachment.id })}
                  className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-[var(--danger)] disabled:opacity-50"
                  aria-label={`Retirar ${attachment.fileName}`}
                  title="Retirar"
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!disabled ? (
        <>
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void upload(event.dataTransfer.files[0]);
            }}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-xs text-fg-muted transition-colors hover:border-border-strong hover:bg-surface-2 disabled:opacity-60',
              dragging ? 'border-accent bg-surface-2' : 'border-border',
            )}
          >
            <Paperclip className="size-3.5" />
            {uploading ? 'Subiendo…' : 'Arrastra un archivo o pulsa para elegirlo · PDF o Word (.docx), máx. 4 MB'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-label="Adjuntar un documento PDF o Word"
            onChange={(event) => void upload(event.target.files?.[0])}
          />
          <p className="text-xs text-fg-subtle">No subas datos de pacientes ni información clínica identificable (RGPD, art. 9).</p>
        </>
      ) : null}

      <ActionError message={error ?? remove.error} />
    </div>
  );
}
