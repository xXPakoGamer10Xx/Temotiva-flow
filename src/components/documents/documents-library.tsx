'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Crown, Download, FileText, Share2, Trash2, Upload, Users, X } from 'lucide-react';
import { DEPARTMENTS } from '@/domain/enums';
import type { Department } from '@/domain/enums';
import { DEPARTMENT_LABELS, departmentsLabel } from '@/domain/labels';
import { MAX_DOCUMENT_DESCRIPTION } from '@/domain/rules';
import { checkDocumentFile } from '@/domain/document-files';
import { uploadLibraryDocument } from '@/lib/upload-document';
import { removeDocumentAction, shareDocumentAction, unshareDocumentAction } from '@/server/actions/documents';
import type { DocumentView, DocumentsPageView } from '@/server/services/documents';
import { ActionError, useAction } from '@/lib/use-action';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge, Card, EmptyState, Input, Label, SectionLabel, Select } from '@/components/ui/primitives';
import { formatDate } from '@/lib/utils';

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsLibrary({
  documents,
  people,
  uploadDepartments,
  myDepartments,
}: DocumentsPageView & {
  /** Áreas a las que esta persona puede subir (Dirección, todas). */
  uploadDepartments: Department[];
  myDepartments: Department[];
}) {
  const [query, setQuery] = React.useState('');
  const [area, setArea] = React.useState<'ALL' | Department>('ALL');
  const [sharing, setSharing] = React.useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const visible = documents.filter(
    (document) =>
      (area === 'ALL' || document.department === area) &&
      (!needle || `${document.fileName} ${document.description}`.toLowerCase().includes(needle)),
  );
  const areasPresent = DEPARTMENTS.filter((department) => documents.some((document) => document.department === department));
  const sharingDocument = documents.find((document) => document.id === sharing) ?? null;

  return (
    <>
      <UploadCard uploadDepartments={uploadDepartments} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SectionLabel className="mr-auto">Documentos ({visible.length})</SectionLabel>
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre…"
            aria-label="Buscar documentos"
            className="w-full sm:w-52"
          />
          {areasPresent.length > 1 ? (
            <div className="w-full sm:w-48">
              <Select value={area} onChange={(event) => setArea(event.target.value as 'ALL' | Department)} aria-label="Filtrar por área">
                <option value="ALL">Todas las áreas</option>
                {areasPresent.map((department) => (
                  <option key={department} value={department}>
                    {DEPARTMENT_LABELS[department]}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            title={documents.length === 0 ? 'Aún no hay documentos' : 'Nada coincide con tu búsqueda'}
            description={
              documents.length === 0
                ? `Sube el primero arriba. Verás los de tu área (${departmentsLabel(myDepartments)}) y los que otras áreas compartan contigo.`
                : 'Prueba con otro nombre o cambia el área.'
            }
          />
        ) : (
          <ul className="space-y-2">
            {visible.map((document) => (
              <DocumentRow key={document.id} document={document} onShare={() => setSharing(document.id)} />
            ))}
          </ul>
        )}
      </section>

      {sharingDocument ? (
        <ShareDialog document={sharingDocument} people={people} myDepartments={myDepartments} onClose={() => setSharing(null)} />
      ) : null}
    </>
  );
}

function UploadCard({ uploadDepartments }: { uploadDepartments: Department[] }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [department, setDepartment] = React.useState<Department>(uploadDepartments[0] ?? 'PRODUCT');
  const [description, setDescription] = React.useState('');
  const [uploading, setUploading] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const upload = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setError(null);
    const problem = checkDocumentFile(file);
    if (problem) return setError(problem);
    setUploading(true);
    const failure = await uploadLibraryDocument({ file, department, description });
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
    if (failure) return setError(failure);
    toast('Documento subido');
    setDescription('');
    router.refresh();
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="doc-area">Área del documento</Label>
          <Select id="doc-area" value={department} onChange={(event) => setDepartment(event.target.value as Department)} disabled={uploading}>
            {uploadDepartments.map((item) => (
              <option key={item} value={item}>
                {DEPARTMENT_LABELS[item]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="doc-description">Descripción (opcional)</Label>
          <Input
            id="doc-description"
            value={description}
            maxLength={MAX_DOCUMENT_DESCRIPTION}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Qué es y para qué sirve"
            disabled={uploading}
          />
        </div>
      </div>

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
        className={`flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-5 text-xs text-fg-muted transition-colors hover:border-border-strong hover:bg-surface-2 disabled:opacity-60 ${dragging ? 'border-accent bg-surface-2' : 'border-border'}`}
      >
        <Upload aria-hidden className="size-3.5" />
        {uploading ? 'Subiendo…' : 'Arrastra un archivo o pulsa para elegirlo · máx. 4 MB · sin ejecutables'}
      </button>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-label="Subir un documento a la biblioteca"
        onChange={(event) => void upload(event.target.files?.[0])}
      />
      <p className="text-xs text-fg-subtle">No subas datos de pacientes ni información clínica identificable (RGPD, art. 9).</p>
      <ActionError message={error} />
    </Card>
  );
}

function DocumentRow({ document, onShare }: { document: DocumentView; onShare: () => void }) {
  const remove = useAction(removeDocumentAction, { success: 'Documento retirado' });

  return (
    <li>
      <Card className="flex flex-wrap items-start gap-3 p-3">
        <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium text-fg [overflow-wrap:anywhere]">{document.fileName}</p>
          {document.description ? <p className="text-xs text-fg-muted [overflow-wrap:anywhere]">{document.description}</p> : null}
          <p className="text-xs text-fg-subtle">
            <span className="tabular-nums">{formatSize(document.sizeBytes)}</span> · {document.uploadedByName} · {formatDate(document.uploadedAt)}
          </p>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <Badge tone={document.isOwnArea ? 'accent' : 'info'}>{DEPARTMENT_LABELS[document.department]}</Badge>
            {document.isOwnArea ? null : <Badge tone="neutral">Compartido contigo</Badge>}
            {document.shares.map((share) => (
              <Badge key={share.id} tone="neutral">
                {share.label}
              </Badge>
            ))}
          </div>
          <ActionError message={remove.error} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* Descarga por la ruta del servidor: el almacén es privado. */}
          <a
            href={`/api/documents/${document.id}`}
            download
            className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            aria-label={`Descargar ${document.fileName}`}
            title="Descargar"
          >
            <Download className="size-3.5" />
          </a>
          {document.canShare ? (
            <Button variant="outline" size="sm" onClick={onShare}>
              <Share2 aria-hidden /> Compartir
            </Button>
          ) : null}
          {document.canRemove ? (
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.run({ documentId: document.id })}
              className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-[var(--danger)] disabled:opacity-50"
              aria-label={`Retirar ${document.fileName}`}
              title="Retirar"
            >
              <Trash2 className="size-3.5" />
            </button>
          ) : null}
        </div>
      </Card>
    </li>
  );
}

function ShareDialog({
  document,
  people,
  myDepartments,
  onClose,
}: {
  document: DocumentView;
  people: DocumentsPageView['people'];
  myDepartments: Department[];
  onClose: () => void;
}) {
  const share = useAction(shareDocumentAction, { success: 'Documento compartido' });
  const unshare = useAction(unshareDocumentAction, { success: 'Acceso retirado' });
  const [query, setQuery] = React.useState('');
  const [team, setTeam] = React.useState<Department>(myDepartments[0] ?? document.department);

  const needle = query.trim().toLowerCase();
  const matches = people
    .filter((person) => !needle || `${person.name} ${departmentsLabel(person.departments)}`.toLowerCase().includes(needle))
    .slice(0, 30);
  const busy = share.isPending || unshare.isPending;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compartir documento</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">
            {document.fileName} · ahora lo ve el equipo de {DEPARTMENT_LABELS[document.department]}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {document.shares.length > 0 ? (
            <div className="space-y-1.5">
              <SectionLabel>Con acceso además</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {document.shares.map((item) => (
                  <span key={item.id} className="tone-neutral inline-flex items-center gap-1 rounded-md py-0.5 pl-1.5 pr-0.5 text-xs">
                    {item.label}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => unshare.run({ shareId: item.id })}
                      className="inline-flex size-4 items-center justify-center rounded hover:bg-surface-3 disabled:opacity-50"
                      aria-label={`Quitar acceso a ${item.label}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <SectionLabel>Para varias personas a la vez</SectionLabel>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => share.run({ documentId: document.id, targetType: 'LEADS' })}>
                <Crown aria-hidden /> Todos los jefes de área
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => share.run({ documentId: document.id, targetType: 'ALL' })}>
                <Building2 aria-hidden /> Todo el equipo (empresa)
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <div className="w-44">
                <Select value={team} onChange={(event) => setTeam(event.target.value as Department)} aria-label="Área con la que compartir">
                  {[...myDepartments, ...DEPARTMENTS.filter((item) => !myDepartments.includes(item))].map((item) => (
                    <option key={item} value={item}>
                      {DEPARTMENT_LABELS[item]}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => share.run({ documentId: document.id, targetType: 'DEPARTMENT', targetDepartment: team })}
              >
                <Users aria-hidden /> Todo el equipo de esta área
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <SectionLabel>Con una persona</SectionLabel>
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre o área…"
              aria-label="Buscar personas"
            />
            {matches.length === 0 ? (
              <p className="py-2 text-xs text-fg-muted">Nadie coincide con la búsqueda.</p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {matches.map((person) => (
                  <li key={person.id} className="flex items-center gap-2 px-3 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-fg">{person.name}</p>
                      <p className="truncate text-xs text-fg-subtle">{departmentsLabel(person.departments)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => share.run({ documentId: document.id, targetType: 'USER', targetUserId: person.id })}
                    >
                      Compartir
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ActionError message={share.error ?? unshare.error} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
