'use client';

import * as React from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { CheckCircle2, HandHelping, Hand, Paperclip } from 'lucide-react';
import type { Department, HelpType } from '@/domain/enums';
import { DEPARTMENT_REQUEST_HELP_TYPES, type AttachmentSide } from '@/domain/department-request';
import {
  DEPARTMENT_LABELS,
  HELP_TYPE_HINTS,
  HELP_TYPE_LABELS,
  REQUEST_BLOCKING_LABEL_LINKED,
  REQUEST_BLOCKING_LABEL_STANDALONE,
} from '@/domain/labels';
import {
  MAX_DEPARTMENT_REQUEST_TITLE,
  MIN_DEPARTMENT_REQUEST_DESCRIPTION,
  MIN_DEPARTMENT_REQUEST_RESOLUTION_NOTES,
  MIN_DEPARTMENT_REQUEST_TITLE,
} from '@/domain/rules';
import type {
  DepartmentRequestView,
  DepartmentRequestsView,
  RequestAttachmentView,
} from '@/server/services/department-requests';
import {
  addDepartmentRequestLinksAction,
  createDepartmentRequestAction,
  resolveDepartmentRequestAction,
  startDepartmentRequestAction,
} from '@/server/actions/department-requests';
import { ActionError, useAction } from '@/lib/use-action';
import { toast } from '@/lib/toast';
import { formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge, Input, Label, SectionLabel, Select, Textarea } from '@/components/ui/primitives';
import { DepartmentChip } from '@/components/shared/signals';
import { RequestBlockingBadge, RequestStatusBadge } from './inbox-badges';
import {
  AttachmentFields,
  AttachmentList,
  EMPTY_ATTACHMENT_DRAFT,
  filledLinks,
  uploadDraftFiles,
  type AttachmentDraft,
} from './attachment-fields';

/** Enlace que abre la ficha de la iniciativa encima del buzón, en su pestaña de dependencias. */
export function initiativeSheetHref(initiativeId: string): Route {
  return `/dependencias?iniciativa=${encodeURIComponent(initiativeId)}&tab=dependencies` as Route;
}

// --- Detalle ---------------------------------------------------------------------

export function RequestDetailDialog({
  request,
  onClose,
}: {
  request: DepartmentRequestView;
  onClose: () => void;
}) {
  const router = useRouter();
  const start = useAction(startDepartmentRequestAction, { success: 'Petición tomada' });
  const resolve = useAction(resolveDepartmentRequestAction, { success: 'Petición resuelta' });
  const addLinks = useAction(addDepartmentRequestLinksAction, { success: 'Adjuntos añadidos' });
  const [notes, setNotes] = React.useState('');
  const [responseDraft, setResponseDraft] = React.useState<AttachmentDraft>(EMPTY_ATTACHMENT_DRAFT);
  const [requestDraft, setRequestDraft] = React.useState<AttachmentDraft>(EMPTY_ATTACHMENT_DRAFT);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const busy = start.isPending || resolve.isPending || addLinks.isPending || uploading;

  const requestSide = request.attachments.filter((item) => item.side === 'REQUEST');
  const responseSide = request.attachments.filter((item) => item.side === 'RESPONSE');
  const countOf = (items: RequestAttachmentView[], kind: RequestAttachmentView['kind']): number =>
    items.filter((item) => item.kind === kind).length;

  /** Sube los archivos del borrador; deja en él solo los que fallaron. `true` si no falló ninguno. */
  const uploadFiles = async (
    side: AttachmentSide,
    draft: AttachmentDraft,
    setDraft: (next: AttachmentDraft) => void,
  ): Promise<boolean> => {
    if (draft.files.length === 0) return true;
    setUploading(true);
    setUploadError(null);
    const { errors, failed } = await uploadDraftFiles(request.id, side, draft.files);
    setUploading(false);
    setDraft({ ...draft, files: failed });
    router.refresh();
    if (errors.length > 0) {
      setUploadError(errors.join(' · '));
      return false;
    }
    return true;
  };

  // Los archivos de la respuesta se suben antes de resolver: tras RESOLVED ya no se admiten.
  const submitResolve = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!(await uploadFiles('RESPONSE', responseDraft, setResponseDraft))) return;
    resolve.run({ requestId: request.id, resolutionNotes: notes, links: filledLinks(responseDraft) }, onClose);
  };

  const submitRequestAdditions = async (): Promise<void> => {
    const links = filledLinks(requestDraft);
    if (!(await uploadFiles('REQUEST', requestDraft, setRequestDraft))) return;
    if (links.length > 0) {
      addLinks.run({ requestId: request.id, side: 'REQUEST', links }, () => setRequestDraft(EMPTY_ATTACHMENT_DRAFT));
    } else {
      toast('Adjuntos añadidos');
      setRequestDraft(EMPTY_ATTACHMENT_DRAFT);
    }
  };
  const requestDraftEmpty = requestDraft.files.length === 0 && filledLinks(requestDraft).length === 0;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="pr-8">{request.title}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-1.5">
            <DepartmentChip department={request.sourceDepartment} />
            <span aria-hidden="true">→</span>
            <span className="sr-only">pide ayuda a</span>
            <DepartmentChip department={request.targetDepartment} />
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <RequestStatusBadge status={request.status} />
            <Badge tone="info">{HELP_TYPE_LABELS[request.helpType]}</Badge>
            <RequestBlockingBadge request={request} />
          </div>

          <p className="whitespace-pre-wrap text-sm leading-relaxed">{request.description}</p>

          {request.initiativeId ? (
            <p className="text-xs text-fg-muted">
              Iniciativa relacionada:{' '}
              <Link href={initiativeSheetHref(request.initiativeId)} scroll={false} className="text-accent-text hover:underline">
                {request.initiativeId}
                {request.initiativeTitle ? ` · ${request.initiativeTitle}` : ''}
              </Link>
            </p>
          ) : null}

          <div className="space-y-2">
            <SectionLabel>Historial</SectionLabel>
            <ol className="space-y-1.5 border-l border-border pl-3 text-xs text-fg-muted">
              <li>
                Creada por <span className="text-fg">{request.requestedByName}</span> ·{' '}
                <span className="tabular-nums">{formatDateTime(request.createdAt)}</span>
              </li>
              {request.assigneeName ? (
                <li>
                  Tomada por <span className="text-fg">{request.assigneeName}</span>
                </li>
              ) : null}
              {request.status === 'RESOLVED' && request.resolvedAt ? (
                <li>
                  Resuelta por <span className="text-fg">{request.resolvedByName ?? 'Persona retirada'}</span> ·{' '}
                  <span className="tabular-nums">{formatDateTime(request.resolvedAt)}</span>
                </li>
              ) : null}
            </ol>
          </div>

          <AttachmentList title="Adjuntos de la petición" attachments={requestSide} />

          {request.canAttachRequest ? (
            <div className="space-y-2">
              <SectionLabel>Añadir a la petición</SectionLabel>
              <AttachmentFields
                idPrefix="request-extra"
                value={requestDraft}
                onChange={setRequestDraft}
                existingFiles={countOf(requestSide, 'FILE')}
                existingLinks={countOf(requestSide, 'LINK')}
                disabled={busy}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || requestDraftEmpty}
                onClick={() => void submitRequestAdditions()}
              >
                <Paperclip aria-hidden />
                {uploading ? 'Subiendo…' : 'Añadir adjuntos'}
              </Button>
            </div>
          ) : null}

          {request.resolutionNotes ? (
            <div className="space-y-1.5">
              <SectionLabel>Respuesta</SectionLabel>
              <p className="whitespace-pre-wrap rounded-md border border-border bg-surface-2 px-3 py-2 text-sm">
                {request.resolutionNotes}
              </p>
            </div>
          ) : null}

          <AttachmentList title="Adjuntos de la respuesta" attachments={responseSide} />

          {request.canResolve ? (
            <form id="resolve-request" onSubmit={(event) => void submitResolve(event)} className="space-y-2">
              <div className="space-y-1.5">
                <Label htmlFor="request-resolution">Respuesta para cerrar la petición</Label>
                <Textarea
                  id="request-resolution"
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder={`Qué se ha hecho o decidido (mínimo ${MIN_DEPARTMENT_REQUEST_RESOLUTION_NOTES} caracteres)`}
                />
              </div>
              <AttachmentFields
                idPrefix="response"
                value={responseDraft}
                onChange={setResponseDraft}
                existingFiles={countOf(responseSide, 'FILE')}
                existingLinks={countOf(responseSide, 'LINK')}
                disabled={busy}
              />
            </form>
          ) : null}

          {!request.canStart && !request.canResolve && request.status !== 'RESOLVED' ? (
            <p className="text-xs text-fg-muted">
              La atiende {DEPARTMENT_LABELS[request.targetDepartment]}. Aquí puedes seguir su estado.
            </p>
          ) : null}

          <ActionError message={uploadError ?? start.error ?? resolve.error ?? addLinks.error} />
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          {request.canStart ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => start.run({ requestId: request.id }, onClose)}
            >
              <Hand aria-hidden />
              Tomar petición
            </Button>
          ) : null}
          {request.canResolve ? (
            <Button
              type="submit"
              form="resolve-request"
              disabled={busy || notes.trim().length < MIN_DEPARTMENT_REQUEST_RESOLUTION_NOTES}
            >
              <CheckCircle2 aria-hidden />
              {uploading ? 'Subiendo…' : 'Resolver'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Creación --------------------------------------------------------------------

export function NewRequestDialog({
  sourceDepartments,
  targetDepartments,
  initiatives,
  onClose,
}: Pick<DepartmentRequestsView, 'sourceDepartments' | 'targetDepartments' | 'initiatives'> & {
  onClose: () => void;
}) {
  const create = useAction(createDepartmentRequestAction, { success: 'Petición enviada' });
  const [sourceDepartment, setSourceDepartment] = React.useState<Department>(sourceDepartments[0] ?? 'PRODUCT');
  const targets = targetDepartments.filter((department) => department !== sourceDepartment);
  const [targetDepartment, setTargetDepartment] = React.useState<Department>(targets[0] ?? 'LEGAL');
  const [helpType, setHelpType] = React.useState<HelpType>('VALIDATION');
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [initiativeId, setInitiativeId] = React.useState('');
  const [blocksInitiative, setBlocksInitiative] = React.useState(false);
  const [draft, setDraft] = React.useState<AttachmentDraft>(EMPTY_ATTACHMENT_DRAFT);
  const router = useRouter();

  const changeSource = (department: Department): void => {
    setSourceDepartment(department);
    if (department === targetDepartment) {
      setTargetDepartment(targetDepartments.find((candidate) => candidate !== department) ?? targetDepartment);
    }
  };

  const ready =
    title.trim().length >= MIN_DEPARTMENT_REQUEST_TITLE &&
    description.trim().length >= MIN_DEPARTMENT_REQUEST_DESCRIPTION &&
    sourceDepartment !== targetDepartment;

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    create.run(
      {
        sourceDepartment,
        targetDepartment,
        helpType,
        title,
        description,
        blocksInitiative,
        initiativeId: initiativeId || null,
        links: filledLinks(draft),
      },
      ({ id }) => {
        // La petición y sus enlaces ya existen; los archivos se suben después
        // (Route Handler) y, si alguno falla, se avisa sin perder la petición.
        const files = draft.files;
        onClose();
        if (files.length === 0) return;
        void uploadDraftFiles(id, 'REQUEST', files).then(({ errors }) => {
          router.refresh();
          if (errors.length > 0) {
            toast(`La petición se envió, pero no se pudo subir: ${errors.join(' · ')}. Añádelo desde su detalle.`, 'danger');
          }
        });
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>Nueva petición</DialogTitle>
            <DialogDescription>
              Solo la verán tu área y el área a la que pides ayuda (y Dirección).
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="request-source">Desde el área</Label>
                {sourceDepartments.length > 1 ? (
                  <Select
                    id="request-source"
                    value={sourceDepartment}
                    onChange={(event) => changeSource(event.target.value as Department)}
                  >
                    {sourceDepartments.map((department) => (
                      <option key={department} value={department}>
                        {DEPARTMENT_LABELS[department]}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <p id="request-source" className="flex h-8 items-center text-sm">
                    {DEPARTMENT_LABELS[sourceDepartment]}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="request-target">Pide ayuda a</Label>
                <Select
                  id="request-target"
                  value={targetDepartment}
                  onChange={(event) => setTargetDepartment(event.target.value as Department)}
                >
                  {targets.map((department) => (
                    <option key={department} value={department}>
                      {DEPARTMENT_LABELS[department]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="request-type">Tipo de necesidad</Label>
              <Select id="request-type" value={helpType} onChange={(event) => setHelpType(event.target.value as HelpType)}>
                {DEPARTMENT_REQUEST_HELP_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {HELP_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-fg-muted">{HELP_TYPE_HINTS[helpType]}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="request-title">Título</Label>
              <Input
                id="request-title"
                value={title}
                maxLength={MAX_DEPARTMENT_REQUEST_TITLE}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={`Resumen en una línea (mínimo ${MIN_DEPARTMENT_REQUEST_TITLE} caracteres)`}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="request-description">Descripción</Label>
              <Textarea
                id="request-description"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={`Qué necesitas exactamente (mínimo ${MIN_DEPARTMENT_REQUEST_DESCRIPTION} caracteres)`}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="request-initiative">Iniciativa relacionada (opcional)</Label>
              <Select id="request-initiative" value={initiativeId} onChange={(event) => setInitiativeId(event.target.value)}>
                <option value="">Ninguna</option>
                {initiatives.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id} · {item.title}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
              <div>
                <Label htmlFor="request-blocking" className="text-fg">
                  {initiativeId ? '¿Bloquea la iniciativa?' : '¿Es de prioridad alta?'}
                </Label>
                <p className="mt-0.5 text-xs text-fg-muted">
                  Se marcará como «{initiativeId ? REQUEST_BLOCKING_LABEL_LINKED : REQUEST_BLOCKING_LABEL_STANDALONE}».
                  Es un aviso: no para el reloj de SLE. Para parar una iniciativa, pide ayuda desde su ficha.
                </p>
              </div>
              <Switch id="request-blocking" checked={blocksInitiative} onCheckedChange={setBlocksInitiative} />
            </div>

            <AttachmentFields idPrefix="new-request" value={draft} onChange={setDraft} disabled={create.isPending} />

            <ActionError message={create.error} />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending || !ready}>
              <HandHelping aria-hidden />
              {create.isPending ? 'Enviando…' : 'Enviar petición'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
