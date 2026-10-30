'use client';

import * as React from 'react';
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react';
import { DEPARTMENTS, TASK_STATUSES } from '@/domain/enums';
import type { Department, TaskStatus } from '@/domain/enums';
import { DEPARTMENT_LABELS, TASK_STATUS_LABELS } from '@/domain/labels';
import { MAX_TASK_DESCRIPTION, MAX_TASK_TITLE } from '@/domain/rules';
import {
  assignDeptTaskAction,
  createDeptTaskAction,
  moveDeptTaskAction,
  removeDeptTaskAction,
} from '@/server/actions/dept-tasks';
import type { DeptTaskView, TasksPageView } from '@/server/services/dept-tasks';
import { ActionError, useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge, Card, EmptyState, Input, Label, SectionLabel, Select, Textarea } from '@/components/ui/primitives';
import { formatDate } from '@/lib/utils';

const todayKey = (): string => new Date().toISOString().slice(0, 10);

/** Las hechas solo se acumulan: se muestran las más recientes y el resto bajo demanda. */
const DONE_VISIBLE = 8;

export function TasksBoard({
  tasks,
  manageableDepartments,
  people,
  initiatives,
  myUserId,
}: TasksPageView & { myUserId: string }) {
  const [onlyMine, setOnlyMine] = React.useState(false);
  const [area, setArea] = React.useState<'ALL' | Department>('ALL');
  const [creating, setCreating] = React.useState(false);

  const areasPresent = DEPARTMENTS.filter((department) => tasks.some((task) => task.department === department));
  const visible = tasks.filter(
    (task) => (!onlyMine || task.assigneeId === myUserId) && (area === 'ALL' || task.department === area),
  );

  return (
    <div className="flex min-h-full flex-col gap-4 md:h-full">
      <div className="flex flex-wrap items-center gap-2">
        <SectionLabel className="mr-auto">Tareas ({visible.length})</SectionLabel>
        <label className="flex items-center gap-1.5 text-xs text-fg-muted">
          <input type="checkbox" checked={onlyMine} onChange={(event) => setOnlyMine(event.target.checked)} />
          Solo las mías
        </label>
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
        {manageableDepartments.length > 0 ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden /> Nueva tarea
          </Button>
        ) : null}
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          title="Aún no hay tareas"
          description={
            manageableDepartments.length > 0
              ? 'Crea la primera con “Nueva tarea” y asígnala a alguien de tu equipo.'
              : 'Cuando el responsable de tu área cree tareas, las verás aquí.'
          }
        />
      ) : (
        <div className="grid gap-4 md:min-h-0 md:flex-1 md:grid-cols-3 md:grid-rows-1">
          {TASK_STATUSES.map((status) => (
            <Column key={status} status={status} tasks={visible.filter((task) => task.status === status)} people={people} myUserId={myUserId} />
          ))}
        </div>
      )}

      {creating ? (
        <CreateDialog
          departments={manageableDepartments}
          people={people}
          initiatives={initiatives}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}

function Column({
  status,
  tasks,
  people,
  myUserId,
}: {
  status: TaskStatus;
  tasks: DeptTaskView[];
  people: TasksPageView['people'];
  myUserId: string;
}) {
  const move = useAction(moveDeptTaskAction);
  const [over, setOver] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);

  const capped = status === 'DONE' && !showAll && tasks.length > DONE_VISIBLE;
  const shown = capped ? tasks.slice(0, DONE_VISIBLE) : tasks;

  return (
    <section
      aria-label={TASK_STATUS_LABELS[status]}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const taskId = event.dataTransfer.getData('text/plain');
        if (taskId) move.run({ taskId, status });
      }}
      className={`flex min-h-32 flex-col gap-2 rounded-lg border bg-surface-2 p-2 transition-colors md:min-h-0 ${over ? 'border-accent' : 'border-border'}`}
    >
      <div className="flex items-center gap-2 px-1">
        <SectionLabel className="mr-auto">{TASK_STATUS_LABELS[status]}</SectionLabel>
        <span className="text-xs tabular-nums text-fg-subtle">{tasks.length}</span>
      </div>
      <ActionError message={move.error} />
      <ul className="scrollbar-slim min-h-0 space-y-2 md:flex-1 md:overflow-y-auto">
        {shown.map((task) => (
          <TaskCard key={task.id} task={task} people={people} myUserId={myUserId} />
        ))}
        {capped ? (
          <li>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAll(true)}>
              Ver las {tasks.length - DONE_VISIBLE} anteriores
            </Button>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function TaskCard({ task, people, myUserId }: { task: DeptTaskView; people: TasksPageView['people']; myUserId: string }) {
  const move = useAction(moveDeptTaskAction);
  const assign = useAction(assignDeptTaskAction, { success: 'Tarea asignada' });
  const remove = useAction(removeDeptTaskAction, { success: 'Tarea retirada' });

  const index = TASK_STATUSES.indexOf(task.status);
  const prev = TASK_STATUSES[index - 1];
  const next = TASK_STATUSES[index + 1];
  const overdue = task.dueDate !== null && task.status !== 'DONE' && task.dueDate < todayKey();
  const busy = move.isPending || assign.isPending || remove.isPending;
  const candidates = people.filter((person) => person.departments.includes(task.department));

  return (
    <li>
      <Card
        className="space-y-2 p-3"
        draggable={task.canMove}
        onDragStart={(event: React.DragEvent) => event.dataTransfer.setData('text/plain', task.id)}
      >
        <p className={`text-sm font-medium [overflow-wrap:anywhere] ${task.status === 'DONE' ? 'text-fg-muted line-through' : 'text-fg'}`}>
          {task.title}
        </p>
        {task.description ? <p className="text-xs text-fg-muted [overflow-wrap:anywhere]">{task.description}</p> : null}
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="accent">{DEPARTMENT_LABELS[task.department]}</Badge>
          {task.initiativeId ? <Badge tone="info">{task.initiativeId}</Badge> : null}
          {task.dueDate ? (
            <Badge tone={overdue ? 'danger' : 'neutral'}>
              {overdue ? 'Vencida · ' : ''}
              {formatDate(task.dueDate)}
            </Badge>
          ) : null}
          <Badge tone={task.isMine ? 'success' : 'neutral'}>
            {task.isMine ? 'Tuya' : (task.assigneeName ?? 'Sin asignar')}
          </Badge>
        </div>

        {task.canManage ? (
          <Select
            value={task.assigneeId ?? ''}
            disabled={busy}
            aria-label={`Asignar “${task.title}”`}
            onChange={(event) => assign.run({ taskId: task.id, assigneeId: event.target.value || null })}
          >
            <option value="">Sin asignar</option>
            {candidates.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        ) : null}

        <div className="flex flex-wrap items-center gap-1">
          {task.canMove && prev ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => move.run({ taskId: task.id, status: prev })}>
              <ArrowLeft aria-hidden /> {TASK_STATUS_LABELS[prev]}
            </Button>
          ) : null}
          {task.canMove && next ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => move.run({ taskId: task.id, status: next })}>
              {TASK_STATUS_LABELS[next]} <ArrowRight aria-hidden />
            </Button>
          ) : null}
          {task.canTake && !task.canManage ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => assign.run({ taskId: task.id, assigneeId: myUserId })}>
              Tomar
            </Button>
          ) : null}
          {task.canManage ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => remove.run({ taskId: task.id })}
              className="ml-auto inline-flex size-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-[var(--danger)] disabled:opacity-50"
              aria-label={`Retirar “${task.title}”`}
              title="Retirar"
            >
              <Trash2 className="size-3.5" />
            </button>
          ) : null}
        </div>
        <ActionError message={move.error ?? assign.error ?? remove.error} />
      </Card>
    </li>
  );
}

function CreateDialog({
  departments,
  people,
  initiatives,
  onClose,
}: {
  departments: Department[];
  people: TasksPageView['people'];
  initiatives: TasksPageView['initiatives'];
  onClose: () => void;
}) {
  const create = useAction(createDeptTaskAction, { success: 'Tarea creada' });
  const [department, setDepartment] = React.useState<Department>(departments[0] ?? 'PRODUCT');
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [assigneeId, setAssigneeId] = React.useState('');
  const [initiativeId, setInitiativeId] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');

  const candidates = people.filter((person) => person.departments.includes(department));

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    create.run(
      {
        title,
        description,
        department,
        assigneeId: assigneeId || null,
        initiativeId: initiativeId || null,
        dueDate: dueDate || null,
      },
      onClose,
    );
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Nueva tarea</DialogTitle>
            <DialogDescription>La verá y la moverá el equipo del área que elijas.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {departments.length > 1 ? (
              <div className="space-y-1.5">
                <Label htmlFor="task-area">Área</Label>
                <Select
                  id="task-area"
                  value={department}
                  onChange={(event) => {
                    setDepartment(event.target.value as Department);
                    setAssigneeId('');
                  }}
                >
                  {departments.map((item) => (
                    <option key={item} value={item}>
                      {DEPARTMENT_LABELS[item]}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Título</Label>
              <Input id="task-title" value={title} maxLength={MAX_TASK_TITLE} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-description">Descripción (opcional)</Label>
              <Textarea
                id="task-description"
                rows={3}
                value={description}
                maxLength={MAX_TASK_DESCRIPTION}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="task-assignee">Asignar a (opcional)</Label>
                <Select id="task-assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                  <option value="">Sin asignar</option>
                  {candidates.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-due">Fecha límite (opcional)</Label>
                <Input id="task-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-initiative">Iniciativa (opcional)</Label>
              <Select id="task-initiative" value={initiativeId} onChange={(event) => setInitiativeId(event.target.value)}>
                <option value="">Ninguna</option>
                {initiatives.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id} · {item.title}
                  </option>
                ))}
              </Select>
            </div>
            <ActionError message={create.error} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending || title.trim().length < 3}>
              Crear tarea
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
