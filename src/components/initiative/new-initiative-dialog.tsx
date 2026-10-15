'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Paperclip, Plus, X } from 'lucide-react';
import { checkUpload, uploadAttachment } from '@/lib/upload-attachment';
import { toast } from '@/lib/toast';
import type { Department, HelpType, PriorityLevel, PriorityReason, UserRole } from '@/domain/enums';
import { DEPARTMENTS, HELP_TYPES_V1, PRIORITY_LEVELS, PRIORITY_REASONS } from '@/domain/enums';
import {
  DEPARTMENT_LABELS,
  DEPARTMENT_SHORT,
  HELP_TYPE_HINTS,
  HELP_TYPE_LABELS,
  PRIORITY_LABELS,
  PRIORITY_REASON_HINTS,
  PRIORITY_REASON_LABELS,
} from '@/domain/labels';
import { MIN_INITIATIVE_TITLE, MIN_STAGE_SKIP_REASON } from '@/domain/rules';
import { createInitiativeAction } from '@/server/actions/initiatives';
import { ActionError, useAction } from '@/lib/use-action';
import { UI_EVENTS, openNewInitiative, useUiEvent } from '@/components/command/command-bus';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Kbd, Label, Select, Textarea } from '@/components/ui/primitives';
import { DepartmentDot } from '@/components/shared/signals';
import { cn } from '@/lib/utils';
import type { InitiativeLink } from '@/domain/types';
import { LinksEditor, cleanLinks, linksAreValid } from './links-editor';

/**
 * Alta de iniciativa. Toda iniciativa nace en Ideación, propiedad del
 * departamento por defecto de esa fase, y exige prioridad **con motivo**.
 *
 * El diálogo vive en el marco de la aplicación y escucha el evento de la
 * paleta, así que se abre con la tecla `C` desde cualquier vista; el botón de
 * la cabecera solo emite ese mismo evento.
 */
export function NewInitiativeButton() {
  return (
    <Button size="sm" onClick={openNewInitiative}>
      <Plus className="size-3.5" />
      Nueva iniciativa
      <Kbd className="ml-0.5 border-transparent bg-white/15 text-inherit">C</Kbd>
    </Button>
  );
}

export interface RouteStage {
  id: number;
  name: string;
  orderIndex: number;
  defaultOwnerDepartment: Department;
}

export function NewInitiativeDialog({
  departments,
  role,
  stages,
}: {
  departments: Department[];
  role: UserRole;
  stages: RouteStage[];
}) {
  // Dirección crea para cualquier área; el resto, solo para las suyas.
  const ownerOptions = role === 'EXECUTIVE' ? [...DEPARTMENTS] : departments;
  const router = useRouter();
  const create = useAction(createInitiativeAction, { success: 'Iniciativa creada' });
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [currentTask, setCurrentTask] = React.useState('');
  const [priority, setPriority] = React.useState<PriorityLevel>('NORMAL');
  const [priorityReason, setPriorityReason] = React.useState<PriorityReason>('ROADMAP');
  const [ownerDepartment, setOwnerDepartment] = React.useState<Department>(ownerOptions[0] ?? 'PRODUCT');
  const [helpDepartments, setHelpDepartments] = React.useState<Department[]>([]);
  const [helpType, setHelpType] = React.useState<HelpType>('INFORMATION');
  const [files, setFiles] = React.useState<File[]>([]);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [skipped, setSkipped] = React.useState<number[]>([]);
  const [routeReason, setRouteReason] = React.useState('');
  const [links, setLinks] = React.useState<InitiativeLink[]>([]);
  const [estimate, setEstimate] = React.useState('');

  const orderedStages = [...stages].sort((a, b) => a.orderIndex - b.orderIndex);
  // Inicio y hito final son de toda ruta; omitir otra exige ser LEAD de su área o Dirección.
  const canSkip = (stage: RouteStage, index: number): boolean =>
    index !== 0 &&
    index !== orderedStages.length - 1 &&
    (role === 'EXECUTIVE' || (role === 'LEAD' && departments.includes(stage.defaultOwnerDepartment)));
  const toggleSkipped = (id: number): void =>
    setSkipped((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  const toggleHelp = (department: Department): void =>
    setHelpDepartments((current) =>
      current.includes(department) ? current.filter((value) => value !== department) : [...current, department],
    );

  useUiEvent(UI_EVENTS.newInitiative, () => setOpen(true));

  const canSubmit =
    title.trim().length >= MIN_INITIATIVE_TITLE &&
    (skipped.length === 0 || routeReason.trim().length >= MIN_STAGE_SKIP_REASON) &&
    linksAreValid(links) &&
    (estimate.trim() === '' || (Number.isInteger(Number(estimate)) && Number(estimate) >= 1 && Number(estimate) <= 365)) &&
    !create.isPending;

  const addFiles = (list: FileList | null): void => {
    const picked = [...(list ?? [])];
    const problem = picked.map(checkUpload).find(Boolean) ?? null;
    setFileError(problem);
    if (!problem) setFiles((current) => [...current, ...picked].slice(0, 5));
  };

  const submit = (): void => {
    create.run(
      {
        title,
        description,
        currentTask,
        priority,
        priorityReason,
        ownerDepartment,
        helpDepartments,
        helpType,
        skippedStageIds: skipped,
        routeReason: skipped.length > 0 ? routeReason : undefined,
        links: cleanLinks(links),
        estimatedDurationDays: estimate.trim() === '' ? undefined : Number(estimate),
      },
      (data) => {
      // La iniciativa ya existe: ahora se suben sus documentos, uno a uno.
      const pending = files;
      void (async () => {
        for (const file of pending) {
          const problem = await uploadAttachment(data.id, file);
          if (problem) toast(`${file.name}: ${problem}`, 'danger');
        }
        if (pending.length > 0) router.refresh();
      })();
      setFiles([]);
      setFileError(null);
      setOpen(false);
      setHelpDepartments([]);
      setSkipped([]);
      setRouteReason('');
      setTitle('');
      setDescription('');
      setCurrentTask('');
      setLinks([]);
      setEstimate('');
      router.push(`/board?iniciativa=${data.id}`);
      },
    );
  };

  return (
    <>
      {open ? (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent className="w-[min(34rem,calc(100vw-2rem))]">
            <DialogHeader>
              <DialogTitle>Nueva iniciativa</DialogTitle>
              <p className="mt-1 text-xs text-fg-muted">
                Entra en Ideación como unidad de valor transversal, no como tarea técnica. Elige qué área la lleva y, si hace falta, a quién pedir ayuda.
              </p>
            </DialogHeader>

            <form
              className="contents"
              onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) submit();
              }}
            >
            <DialogBody className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="new-title">Título</Label>
                <Input
                  id="new-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Protocolo SOS de relajación somática nocturna"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-description">Descripción</Label>
                <Textarea
                  id="new-description"
                  rows={4}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Problema que atiende, enfoque clínico e impacto esperado"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="new-priority">Prioridad</Label>
                  <Select
                    id="new-priority"
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as PriorityLevel)}
                  >
                    {PRIORITY_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {PRIORITY_LABELS[level]}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-priority-reason">Motivo de la prioridad (obligatorio)</Label>
                  <Select
                    id="new-priority-reason"
                    value={priorityReason}
                    onChange={(event) => setPriorityReason(event.target.value as PriorityReason)}
                  >
                    {PRIORITY_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {PRIORITY_REASON_LABELS[reason]}
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-fg-subtle">{PRIORITY_REASON_HINTS[priorityReason]}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-owner">Área responsable</Label>
                <Select
                  id="new-owner"
                  value={ownerDepartment}
                  onChange={(event) => {
                    const next = event.target.value as Department;
                    setOwnerDepartment(next);
                    setHelpDepartments((current) => current.filter((value) => value !== next));
                  }}
                >
                  {ownerOptions.map((department) => (
                    <option key={department} value={department}>
                      {DEPARTMENT_LABELS[department]}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-fg-subtle">
                  {role === 'EXECUTIVE'
                    ? 'El área que lleva el trabajo. Como Dirección puedes elegir cualquiera.'
                    : 'El área que lleva el trabajo. Solo puedes elegir entre las tuyas.'}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-documents">Documentos (opcional)</Label>
                <p className="text-xs text-fg-subtle">
                  PDF o Word (.docx), máx. 4 MB cada uno, hasta 5. Describen la iniciativa o ayudan al equipo. Sin datos de pacientes.
                </p>
                {files.length > 0 ? (
                  <ul className="space-y-1">
                    {files.map((file, index) => (
                      <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
                        <Paperclip className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
                        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                          className="text-fg-subtle hover:text-fg"
                          aria-label={`Quitar ${file.name}`}
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <input
                  id="new-documents"
                  type="file"
                  multiple
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => {
                    addFiles(event.target.files);
                    event.target.value = '';
                  }}
                  className="block w-full text-xs text-fg-muted file:mr-2 file:h-7 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-surface file:px-2.5 file:text-xs file:font-medium file:text-fg hover:file:bg-surface-2"
                />
                {fileError ? <p role="alert" className="text-xs text-[var(--danger)]">{fileError}</p> : null}
              </div>

              <fieldset className="space-y-1.5">
                <legend className="text-xs font-medium text-fg">Ruta de fases</legend>
                <p className="text-xs text-fg-subtle">
                  Por defecto recorre las {orderedStages.length} fases. Desmarca una si no aplica: solo la puede omitir el
                  responsable de su área o Dirección.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {orderedStages.map((stage, index) => {
                    const included = !skipped.includes(stage.id);
                    const editable = canSkip(stage, index);
                    return (
                      <button
                        key={stage.id}
                        type="button"
                        aria-pressed={included}
                        disabled={!editable}
                        title={editable ? undefined : `Solo ${DEPARTMENT_LABELS[stage.defaultOwnerDepartment]} (responsable) o Dirección`}
                        onClick={() => toggleSkipped(stage.id)}
                        className={cn(
                          'h-7 rounded-md px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                          included ? 'tone-accent' : 'border border-border text-fg-subtle line-through',
                        )}
                      >
                        {stage.name}
                      </button>
                    );
                  })}
                </div>
                {skipped.length > 0 ? (
                  <Textarea
                    rows={2}
                    value={routeReason}
                    onChange={(event) => setRouteReason(event.target.value)}
                    placeholder={`Por qué no aplica (mínimo ${MIN_STAGE_SKIP_REASON} caracteres)`}
                    aria-label="Motivo de la ruta reducida"
                  />
                ) : null}
              </fieldset>

              <fieldset className="space-y-1.5">
                <legend className="text-xs font-medium text-fg">¿Necesitas ayuda de otros departamentos? (opcional)</legend>
                <div className="flex flex-wrap gap-1.5">
                  {DEPARTMENTS.filter((department) => department !== ownerDepartment).map((department) => {
                    const active = helpDepartments.includes(department);
                    return (
                      <button
                        key={department}
                        type="button"
                        aria-pressed={active}
                        title={DEPARTMENT_LABELS[department]}
                        onClick={() => toggleHelp(department)}
                        className={cn(
                          'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors',
                          active
                            ? 'tone-accent'
                            : 'border border-border text-fg-muted hover:border-border-strong hover:bg-surface-2 hover:text-fg',
                        )}
                      >
                        <DepartmentDot department={department} />
                        {DEPARTMENT_SHORT[department]}
                      </button>
                    );
                  })}
                </div>
                {helpDepartments.length > 0 ? (
                  <div className="space-y-1.5 pt-1">
                    <Label htmlFor="new-help-type">Qué necesitas de ellos</Label>
                    <Select
                      id="new-help-type"
                      value={helpType}
                      onChange={(event) => setHelpType(event.target.value as HelpType)}
                    >
                      {HELP_TYPES_V1.map((type) => (
                        <option key={type} value={type}>
                          {HELP_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </Select>
                    <p className="text-xs text-fg-subtle">
                      {HELP_TYPE_HINTS[helpType]} Se abre una solicitud 🆘 a cada uno; no paran la iniciativa ni cambian
                      quién es el dueño.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-fg-subtle">
                    Se les avisa en Notificaciones. Puedes pedir ayuda más tarde desde la ficha.
                  </p>
                )}
              </fieldset>

              <div className="space-y-1.5">
                <Label htmlFor="new-task">Tarea en curso (opcional)</Label>
                <Input
                  id="new-task"
                  value={currentTask}
                  onChange={(event) => setCurrentTask(event.target.value)}
                  placeholder="Redacción del Concept Brief"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-estimate">Tiempo estimado en días (opcional)</Label>
                <Input
                  id="new-estimate"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={365}
                  step={1}
                  value={estimate}
                  onChange={(event) => setEstimate(event.target.value)}
                  placeholder="Ej. 14"
                  className="tabular-nums sm:w-40"
                />
                <p className="text-xs text-fg-subtle">Cuánto se espera que tarde. Es orientativo y no cuenta contra el SLE.</p>
              </div>

              <div className="space-y-1.5">
                <Label>Enlaces (opcional)</Label>
                <LinksEditor value={links} onChange={setLinks} />
              </div>

              <ActionError message={create.error} />
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {create.isPending ? 'Creando…' : 'Crear iniciativa'}
              </Button>
            </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
