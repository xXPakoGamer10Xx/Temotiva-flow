'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import type { PriorityLevel, PriorityReason } from '@/domain/enums';
import { PRIORITY_LEVELS, PRIORITY_REASONS } from '@/domain/enums';
import { PRIORITY_LABELS, PRIORITY_REASON_HINTS, PRIORITY_REASON_LABELS } from '@/domain/labels';
import { MIN_INITIATIVE_TITLE } from '@/domain/rules';
import { createInitiativeAction } from '@/server/actions/initiatives';
import { ActionError, useAction } from '@/lib/use-action';
import { UI_EVENTS, useUiEvent } from '@/components/command/command-bus';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Kbd, Label, Select, Textarea } from '@/components/ui/primitives';

/**
 * Alta de iniciativa. Toda iniciativa nace en Ideación, propiedad del
 * departamento por defecto de esa fase, y exige prioridad **con motivo**.
 *
 * Se abre con el botón o con la tecla `C` desde cualquier punto de la vista.
 */
export function NewInitiativeDialog() {
  const router = useRouter();
  const create = useAction(createInitiativeAction);
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [currentTask, setCurrentTask] = React.useState('');
  const [priority, setPriority] = React.useState<PriorityLevel>('NORMAL');
  const [priorityReason, setPriorityReason] = React.useState<PriorityReason>('ROADMAP');

  useUiEvent(UI_EVENTS.newInitiative, () => setOpen(true));

  const canSubmit = title.trim().length >= MIN_INITIATIVE_TITLE && !create.isPending;

  const submit = (): void => {
    create.run({ title, description, currentTask, priority, priorityReason }, (data) => {
      setOpen(false);
      setTitle('');
      setDescription('');
      setCurrentTask('');
      router.push(`/board?iniciativa=${data.id}`);
    });
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Nueva iniciativa
        <Kbd className="ml-0.5 border-transparent bg-white/15 text-inherit">C</Kbd>
      </Button>

      {open ? (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent className="w-[min(34rem,calc(100vw-2rem))]">
            <DialogHeader>
              <DialogTitle>Nueva iniciativa</DialogTitle>
              <p className="mt-1 text-xs text-fg-muted">
                Entra en Ideación como unidad de valor transversal, no como tarea técnica.
              </p>
            </DialogHeader>

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
                  <p className="text-[11px] text-fg-subtle">{PRIORITY_REASON_HINTS[priorityReason]}</p>
                </div>
              </div>

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
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={submit} disabled={!canSubmit}>
                {create.isPending ? 'Creando…' : 'Crear iniciativa'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
