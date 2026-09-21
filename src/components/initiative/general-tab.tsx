'use client';

import * as React from 'react';
import { Archive, ExternalLink, Save, Undo2, UserCog } from 'lucide-react';
import { DEPARTMENTS, PRIORITY_LEVELS, PRIORITY_REASONS } from '@/domain/enums';
import type { Department, PriorityLevel, PriorityReason } from '@/domain/enums';
import {
  DEPARTMENT_LABELS,
  LINK_KIND_LABELS,
  PRIORITY_LABELS,
  PRIORITY_REASON_LABELS,
} from '@/domain/labels';
import { MIN_ARCHIVE_REASON, MIN_REASSIGN_REASON } from '@/domain/rules';
import type { InitiativeDetailView } from '@/server/services/views';
import {
  archiveInitiativeAction,
  assignInitiativeAction,
  reassignOwnerAction,
  restoreInitiativeAction,
  updateInitiativeAction,
} from '@/server/actions/initiatives';
import { ActionError, useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Separator, Textarea } from '@/components/ui/primitives';
import { formatDateTime } from '@/lib/utils';
import type { InitiativeCapabilities } from './initiative-dialog';

/**
 * Pestaña General: campos descriptivos, enlaces, propiedad y asignación.
 * Editable en cualquier momento (principio de operación continua).
 */
export function GeneralTab({
  detail,
  capabilities,
}: {
  detail: InitiativeDetailView;
  capabilities: InitiativeCapabilities;
}) {
  const { card } = detail;
  const update = useAction(updateInitiativeAction);
  const assign = useAction(assignInitiativeAction);
  const reassign = useAction(reassignOwnerAction);
  const archive = useAction(archiveInitiativeAction);
  const restore = useAction(restoreInitiativeAction);

  const [title, setTitle] = React.useState(card.title);
  const [description, setDescription] = React.useState(card.description);
  const [currentTask, setCurrentTask] = React.useState(card.currentTask ?? '');
  const [priority, setPriority] = React.useState<PriorityLevel>(card.priority);
  const [priorityReason, setPriorityReason] = React.useState<PriorityReason>(card.priorityReason);

  const [reassignOpen, setReassignOpen] = React.useState(false);
  const [targetDepartment, setTargetDepartment] = React.useState<Department>(card.ownerDepartment);
  const [reassignReason, setReassignReason] = React.useState('');

  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [archiveReason, setArchiveReason] = React.useState('');

  const isDirty =
    title !== card.title ||
    description !== card.description ||
    (currentTask || null) !== card.currentTask ||
    priority !== card.priority ||
    priorityReason !== card.priorityReason;

  const save = (): void => {
    update.run({
      initiativeId: card.id,
      title,
      description,
      currentTask: currentTask || null,
      priority,
      priorityReason,
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="initiative-title">Título</Label>
          <Input
            id="initiative-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={card.isArchived}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="initiative-description">Descripción</Label>
          <Textarea
            id="initiative-description"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={card.isArchived}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="initiative-task">Tarea en curso</Label>
            <Input
              id="initiative-task"
              value={currentTask}
              placeholder="Qué se está haciendo ahora mismo"
              onChange={(event) => setCurrentTask(event.target.value)}
              disabled={card.isArchived}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="initiative-priority">Prioridad</Label>
              <Select
                id="initiative-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value as PriorityLevel)}
                disabled={card.isArchived}
              >
                {PRIORITY_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {PRIORITY_LABELS[level]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="initiative-priority-reason">Motivo</Label>
              <Select
                id="initiative-priority-reason"
                value={priorityReason}
                onChange={(event) => setPriorityReason(event.target.value as PriorityReason)}
                disabled={card.isArchived}
              >
                {PRIORITY_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {PRIORITY_REASON_LABELS[reason]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        <ActionError message={update.error} />

        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={!isDirty || update.isPending || card.isArchived} size="sm">
            <Save className="size-4" />
            {update.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
          {isDirty ? <span className="text-[11px] text-muted-foreground">Hay cambios sin guardar</span> : null}
        </div>
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Propiedad</Label>
          <p className="text-sm">{DEPARTMENT_LABELS[card.ownerDepartment]}</p>
          <p className="text-[11px] text-muted-foreground">
            La propiedad viaja con la fase. Abrir una dependencia a otro departamento no la transfiere.
          </p>
          {capabilities.canReassign && !card.isArchived ? (
            reassignOpen ? (
              <div className="space-y-2 rounded-md border border-border p-3">
                <Select
                  value={targetDepartment}
                  onChange={(event) => setTargetDepartment(event.target.value as Department)}
                  aria-label="Departamento destino"
                >
                  {DEPARTMENTS.map((department) => (
                    <option key={department} value={department}>
                      {DEPARTMENT_LABELS[department]}
                    </option>
                  ))}
                </Select>
                <Textarea
                  rows={2}
                  value={reassignReason}
                  placeholder={`Motivo de la reasignación (mínimo ${MIN_REASSIGN_REASON} caracteres)`}
                  onChange={(event) => setReassignReason(event.target.value)}
                />
                <ActionError message={reassign.error} />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={reassign.isPending}
                    onClick={() =>
                      reassign.run(
                        { initiativeId: card.id, targetDepartment, reason: reassignReason },
                        () => {
                          setReassignOpen(false);
                          setReassignReason('');
                        },
                      )
                    }
                  >
                    Reasignar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setReassignOpen(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setReassignOpen(true)}>
                <UserCog className="size-4" />
                Reasignar propiedad
              </Button>
            )
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="initiative-assignee">Responsable individual</Label>
          <Select
            id="initiative-assignee"
            value={card.assignee?.id ?? ''}
            disabled={assign.isPending || card.isArchived}
            onChange={(event) =>
              assign.run({ initiativeId: card.id, assigneeId: event.target.value || null })
            }
          >
            <option value="">Sin asignar</option>
            {detail.departmentMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </Select>
          <ActionError message={assign.error} />
          <p className="text-[11px] text-muted-foreground">
            Solo personas del departamento propietario de la fase actual.
          </p>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label>Enlaces</Label>
        {card.links.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin enlaces de Figma, Notion o repositorio.</p>
        ) : (
          <ul className="space-y-1.5">
            {card.links.map((link) => (
              <li key={link.url}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="size-3.5" />
                  <span className="font-medium">{LINK_KIND_LABELS[link.kind]}</span> · {link.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Separator />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <dl className="grid gap-x-6 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-2">
          <div className="flex gap-1">
            <dt>Creada por:</dt>
            <dd className="text-foreground">{detail.creator?.name ?? '—'}</dd>
          </div>
          <div className="flex gap-1">
            {/* "Alta" a secas se confundía con el nivel de prioridad. */}
            <dt>Creada el:</dt>
            <dd className="text-foreground">{formatDateTime(detail.createdAt)}</dd>
          </div>
          <div className="flex gap-1">
            <dt>Última actividad:</dt>
            <dd className="text-foreground">{formatDateTime(card.updatedAt)}</dd>
          </div>
        </dl>

        {capabilities.canArchive ? (
          card.isArchived ? (
            <Button
              size="sm"
              variant="outline"
              disabled={restore.isPending}
              onClick={() => restore.run({ initiativeId: card.id })}
            >
              <Undo2 className="size-4" />
              Restaurar
            </Button>
          ) : archiveOpen ? (
            <div className="w-full space-y-2 rounded-md border border-border p-3 sm:w-80">
              <Textarea
                rows={2}
                value={archiveReason}
                placeholder={`Motivo del archivado (mínimo ${MIN_ARCHIVE_REASON} caracteres)`}
                onChange={(event) => setArchiveReason(event.target.value)}
              />
              <ActionError message={archive.error} />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  disabled={archive.isPending}
                  onClick={() => archive.run({ initiativeId: card.id, reason: archiveReason })}
                >
                  Archivar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setArchiveOpen(false)}>
                  Cancelar
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                El archivado es lógico: la iniciativa sale del tablero pero su trazabilidad permanece intacta.
              </p>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setArchiveOpen(true)}>
              <Archive className="size-4" />
              Archivar
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}
