'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
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
import { MIN_INITIATIVE_TITLE } from '@/domain/rules';
import { createInitiativeAction } from '@/server/actions/initiatives';
import { ActionError, useAction } from '@/lib/use-action';
import { UI_EVENTS, openNewInitiative, useUiEvent } from '@/components/command/command-bus';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Kbd, Label, Select, Textarea } from '@/components/ui/primitives';
import { DepartmentDot } from '@/components/shared/signals';
import { cn } from '@/lib/utils';

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

export function NewInitiativeDialog({ departments, role }: { departments: Department[]; role: UserRole }) {
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

  const toggleHelp = (department: Department): void =>
    setHelpDepartments((current) =>
      current.includes(department) ? current.filter((value) => value !== department) : [...current, department],
    );

  useUiEvent(UI_EVENTS.newInitiative, () => setOpen(true));

  const canSubmit = title.trim().length >= MIN_INITIATIVE_TITLE && !create.isPending;

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
      },
      (data) => {
      setOpen(false);
      setHelpDepartments([]);
      setTitle('');
      setDescription('');
      setCurrentTask('');
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
