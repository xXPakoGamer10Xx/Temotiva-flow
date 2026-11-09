'use client';

import * as React from 'react';
import { ExternalLink, FileText, ImageIcon, Link2, Paperclip, Plus, Trash2, X } from 'lucide-react';
import type { AttachmentSide } from '@/domain/department-request';
import { MAX_REQUEST_FILES_PER_SIDE, MAX_REQUEST_LINKS_PER_SIDE, MAX_REQUEST_LINK_LABEL } from '@/domain/rules';
import type { RequestAttachmentView } from '@/server/services/department-requests';
import { removeDepartmentRequestAttachmentAction } from '@/server/actions/department-requests';
import { REQUEST_FILE_ACCEPT, checkRequestUpload, uploadRequestFile } from '@/lib/upload-request-file';
import { useAction } from '@/lib/use-action';
import { formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Label, SectionLabel } from '@/components/ui/primitives';

/**
 * Adjuntos de una petición entre áreas (spec 001, ampliación A): editor de
 * archivos y enlaces para un formulario, y listado de lo ya adjuntado.
 * Validar aquí es comodidad; el servidor decide por los bytes y repite los cupos.
 */

export interface LinkDraft {
  label: string;
  url: string;
}

export interface AttachmentDraft {
  files: File[];
  links: LinkDraft[];
}

export const EMPTY_ATTACHMENT_DRAFT: AttachmentDraft = { files: [], links: [] };

/** Enlaces con algo escrito; los vacíos se ignoran al enviar. */
export function filledLinks(draft: AttachmentDraft): LinkDraft[] {
  return draft.links.filter((link) => link.label.trim() !== '' || link.url.trim() !== '');
}

/**
 * Sube los archivos uno a uno. Devuelve los errores (con el nombre de cada
 * archivo) y los que fallaron, para poder reintentarlos sin repetir los demás.
 */
export async function uploadDraftFiles(
  requestId: string,
  side: AttachmentSide,
  files: File[],
): Promise<{ errors: string[]; failed: File[] }> {
  const errors: string[] = [];
  const failed: File[] = [];
  for (const file of files) {
    const error = await uploadRequestFile(requestId, side, file);
    if (error) {
      errors.push(`${file.name}: ${error}`);
      failed.push(file);
    }
  }
  return { errors, failed };
}

export function AttachmentFields({
  idPrefix,
  value,
  onChange,
  existingFiles = 0,
  existingLinks = 0,
  disabled = false,
}: {
  idPrefix: string;
  value: AttachmentDraft;
  onChange: (next: AttachmentDraft) => void;
  /** Ya adjuntados en este lado: cuentan para el cupo. */
  existingFiles?: number;
  existingLinks?: number;
  disabled?: boolean;
}) {
  const [fileError, setFileError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const filesLeft = MAX_REQUEST_FILES_PER_SIDE - existingFiles - value.files.length;
  const linksLeft = MAX_REQUEST_LINKS_PER_SIDE - existingLinks - value.links.length;

  const addFiles = (list: FileList | null): void => {
    const picked = Array.from(list ?? []);
    const accepted: File[] = [];
    let error: string | null = null;
    for (const file of picked) {
      const problem = checkRequestUpload(file);
      if (problem) error = `${file.name}: ${problem}`;
      else if (accepted.length < filesLeft) accepted.push(file);
      else error = `Como máximo ${MAX_REQUEST_FILES_PER_SIDE} archivos.`;
    }
    setFileError(error);
    if (accepted.length > 0) onChange({ ...value, files: [...value.files, ...accepted] });
    if (inputRef.current) inputRef.current.value = '';
  };

  const patchLink = (index: number, patch: Partial<LinkDraft>): void =>
    onChange({ ...value, links: value.links.map((link, i) => (i === index ? { ...link, ...patch } : link)) });

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-files`}>Archivos (opcional)</Label>
        <p className="text-xs text-fg-muted">PDF, Word o imágenes PNG, JPG y WebP. Hasta 4 MB cada uno.</p>
        <input
          ref={inputRef}
          id={`${idPrefix}-files`}
          type="file"
          multiple
          accept={REQUEST_FILE_ACCEPT}
          disabled={disabled || filesLeft <= 0}
          onChange={(event) => addFiles(event.target.files)}
          className="block w-full text-xs text-fg-muted file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-2.5 file:py-1 file:text-xs file:text-fg hover:file:bg-surface-2"
        />
        {fileError ? (
          <p role="alert" className="tone-danger rounded-md px-2.5 py-1.5 text-xs">
            {fileError}
          </p>
        ) : null}
        {value.files.length > 0 ? (
          <ul className="space-y-1">
            {value.files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center gap-2 text-xs">
                <Paperclip className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="tabular-nums text-fg-subtle">{formatSize(file.size)}</span>
                <Button
                  type="button"
                  size="iconSm"
                  variant="ghost"
                  aria-label={`Quitar ${file.name}`}
                  disabled={disabled}
                  onClick={() => onChange({ ...value, files: value.files.filter((_, i) => i !== index) })}
                >
                  <X aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Enlaces (opcional)</p>
        {value.links.map((link, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <Input
              aria-label={`Nombre del enlace ${index + 1}`}
              placeholder="Nombre (p. ej. Diseño en Figma)"
              value={link.label}
              maxLength={MAX_REQUEST_LINK_LABEL}
              disabled={disabled}
              onChange={(event) => patchLink(index, { label: event.target.value })}
              className="h-8 sm:w-48"
            />
            <Input
              aria-label={`Dirección del enlace ${index + 1}`}
              placeholder="https://…"
              type="url"
              inputMode="url"
              value={link.url}
              disabled={disabled}
              onChange={(event) => patchLink(index, { url: event.target.value })}
              className="h-8 min-w-0 flex-1"
            />
            <Button
              type="button"
              size="iconSm"
              variant="ghost"
              aria-label={`Quitar el enlace ${index + 1}`}
              disabled={disabled}
              onClick={() => onChange({ ...value, links: value.links.filter((_, i) => i !== index) })}
            >
              <X aria-hidden />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || linksLeft <= 0}
          onClick={() => onChange({ ...value, links: [...value.links, { label: '', url: '' }] })}
        >
          <Plus aria-hidden /> Añadir enlace
        </Button>
      </div>
    </div>
  );
}

/**
 * Retirar un adjunto (ampliación B). Confirmación en línea, sin diálogos del
 * navegador: el primer clic pregunta y el segundo retira. Es baja lógica.
 */
function RemoveAttachmentControl({ attachmentId, name }: { attachmentId: string; name: string }) {
  const remove = useAction(removeDepartmentRequestAttachmentAction, { success: 'Adjunto retirado' });
  const [confirming, setConfirming] = React.useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        size="iconSm"
        variant="ghost"
        aria-label={`Retirar ${name}`}
        title="Retirar"
        onClick={() => setConfirming(true)}
      >
        <Trash2 aria-hidden />
      </Button>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1" role="group" aria-label={`Confirmar retirada de ${name}`}>
      <span className="text-fg-muted">¿Retirar?</span>
      <Button
        type="button"
        size="sm"
        variant="danger"
        disabled={remove.isPending}
        onClick={() => remove.run({ attachmentId }, () => setConfirming(false))}
      >
        {remove.isPending ? 'Retirando…' : 'Sí'}
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={remove.isPending} onClick={() => setConfirming(false)}>
        No
      </Button>
      {remove.error ? (
        <span role="alert" className="tone-danger rounded px-1.5 py-0.5">
          {remove.error}
        </span>
      ) : null}
    </span>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Hostname para que se vea adónde lleva un enlace antes de abrirlo. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function AttachmentList({
  title,
  attachments,
}: {
  title: string;
  attachments: RequestAttachmentView[];
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <SectionLabel>{title}</SectionLabel>
      <ul className="space-y-1">
        {attachments.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-xs">
            {item.kind === 'FILE' ? (
              <>
                {item.contentType.startsWith('image/') ? (
                  <ImageIcon className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
                ) : (
                  <FileText className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
                )}
                <a href={item.downloadUrl} className="min-w-0 truncate text-accent-text hover:underline">
                  {item.fileName}
                </a>
                <span className="tabular-nums text-fg-subtle">{formatSize(item.sizeBytes)}</span>
              </>
            ) : (
              <>
                <Link2 className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex min-w-0 items-center gap-1 truncate text-accent-text hover:underline"
                >
                  {item.label}
                  <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                  <span className="sr-only">(se abre en otra pestaña)</span>
                </a>
                <span className="truncate text-fg-subtle">{hostOf(item.url)}</span>
              </>
            )}
            <span className="ml-auto shrink-0 text-fg-subtle">
              {item.addedByName} · <span className="tabular-nums">{formatDateTime(item.addedAt)}</span>
            </span>
            {item.canRemove ? (
              <RemoveAttachmentControl
                attachmentId={item.id}
                name={item.kind === 'FILE' ? item.fileName : item.label}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
