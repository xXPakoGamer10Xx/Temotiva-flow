'use client';

import * as React from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CalendarRange,
  ExternalLink,
  GitPullRequest,
  ListPlus,
  Pencil,
  Plus,
  Undo2,
} from 'lucide-react';
import { TASK_STATUSES } from '@/domain/enums';
import type { PullRequestState, TaskStatus } from '@/domain/enums';
import { PULL_REQUEST_STATE_LABELS, TASK_STATUS_LABELS } from '@/domain/labels';
import { MAX_SPRINT_CAPACITY, MAX_SPRINT_GOAL, MAX_SPRINT_NAME, MAX_TASK_DESCRIPTION, MAX_TASK_HOURS, MAX_TASK_TITLE } from '@/domain/rules';
import {
  assignDeptTaskAction,
  createDeptTaskAction,
  moveDeptTaskAction,
  planDeptTaskAction,
} from '@/server/actions/dept-tasks';
import { carryOverSprintAction, createSprintAction, updateSprintAction } from '@/server/actions/tech-sprint';
import type { DeptTaskView } from '@/server/services/dept-tasks';
import type { PersonLoad, SprintOption, SprintPace, TechSprintView } from '@/server/services/tech-sprint';
import { ActionError, useAction } from '@/lib/use-action';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
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
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  Input,
  Label,
  Progress,
  SectionLabel,
  Select,
  Textarea,
} from '@/components/ui/primitives';

// --- Formato -------------------------------------------------------------------

/** Las fechas de sprint son días de calendario: se pintan en UTC para no correrse por el huso. */
const DAY_FORMAT = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayLabel = (dateKey: string): string => DAY_FORMAT.format(new Date(`${dateKey}T00:00:00.000Z`));
const hoursLabel = (hours: number): string => `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;

const PACE: Record<SprintPace, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  NOT_STARTED: { label: 'Aún no empieza', tone: 'neutral' },
  ON_TRACK: { label: 'En ritmo', tone: 'success' },
  AT_RISK: { label: 'En riesgo', tone: 'warning' },
  BEHIND: { label: 'Atrasado', tone: 'danger' },
  FINISHED: { label: 'Completado', tone: 'success' },
};

const PR_TONE: Record<PullRequestState, 'neutral' | 'info' | 'success' | 'danger'> = {
  DRAFT: 'neutral',
  OPEN: 'info',
  MERGED: 'success',
  CLOSED: 'danger',
};

/** Filtros rápidos del PM: por persona o por riesgo. */
type Focus =
  | { kind: 'all' }
  | { kind: 'person'; userId: string | null }
  | { kind: 'overdue' }
  | { kind: 'unestimated' }
  | { kind: 'unassigned' };

const isOverdue = (task: DeptTaskView, today: string): boolean =>
  task.dueDate !== null && task.status !== 'DONE' && task.dueDate < today;

function matchesFocus(task: DeptTaskView, focus: Focus, today: string): boolean {
  switch (focus.kind) {
    case 'all':
      return true;
    case 'person':
      return task.assigneeId === focus.userId;
    case 'overdue':
      return isOverdue(task, today);
    case 'unestimated':
      return task.status !== 'DONE' && task.estimatedHours === null;
    case 'unassigned':
      return task.status !== 'DONE' && task.assigneeId === null;
  }
}

type DialogState =
  | { kind: 'task' }
  | { kind: 'new-sprint' }
  | { kind: 'edit-sprint'; sprint: SprintOption }
  | { kind: 'carry'; from: SprintOption }
  | null;

// --- Vista principal -------------------------------------------------------------

export function TechSprintBoard({ myUserId, ...view }: TechSprintView & { myUserId: string }) {
  const router = useRouter();
  const [focus, setFocus] = React.useState<Focus>({ kind: 'all' });
  const [dialog, setDialog] = React.useState<DialogState>(null);
  const { selected, canManage, today } = view;

  const visible = view.tasks.filter((task) => matchesFocus(task, focus, today));
  const close = (): void => setDialog(null);

  return (
    <div className="flex flex-col gap-4">
      <SprintBar
        view={view}
        onSelect={(id) => {
          setFocus({ kind: 'all' });
          router.push(`/tech?sprint=${encodeURIComponent(id)}` as Route);
        }}
        onNewSprint={() => setDialog({ kind: 'new-sprint' })}
        onEditSprint={(sprint) => setDialog({ kind: 'edit-sprint', sprint })}
        onCarry={(from) => setDialog({ kind: 'carry', from })}
        onNewTask={() => setDialog({ kind: 'task' })}
      />

      {!selected ? (
        <EmptyState
          mascot
          title="Aún no hay sprints de Tech"
          description={
            canManage
              ? `Abre el primero: te propongo del ${dayLabel(view.suggestion.startDate)} al ${dayLabel(view.suggestion.endDate)}, y luego reparte tareas, horas y fechas.`
              : 'Cuando el responsable de Tech abra un sprint, verás aquí tus tareas y su avance.'
          }
          action={
            canManage ? (
              <Button size="sm" onClick={() => setDialog({ kind: 'new-sprint' })}>
                <CalendarRange aria-hidden /> Abrir sprint
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {view.health ? <HealthPanel view={view} /> : null}
          <RiskStrip view={view} focus={focus} onFocus={setFocus} />
          <WorkloadTable load={view.load} focus={focus} onFocus={setFocus} />

          <div className="flex flex-wrap items-center gap-2">
            <SectionLabel className="mr-auto">
              Tablero del sprint ({visible.length}
              {visible.length !== view.tasks.length ? ` de ${view.tasks.length}` : ''})
            </SectionLabel>
            {focus.kind !== 'all' ? (
              <Button variant="ghost" size="sm" onClick={() => setFocus({ kind: 'all' })}>
                <Undo2 aria-hidden /> Quitar filtro
              </Button>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {TASK_STATUSES.map((status) => (
              <Column
                key={status}
                status={status}
                tasks={visible.filter((task) => task.status === status)}
                view={view}
                myUserId={myUserId}
              />
            ))}
          </div>
        </>
      )}

      <Backlog view={view} />
      <GitHubHint configured={view.githubConfigured} canManage={canManage} />

      {dialog?.kind === 'task' ? <TaskDialog view={view} onClose={close} /> : null}
      {dialog?.kind === 'new-sprint' ? <SprintDialog view={view} onClose={close} /> : null}
      {dialog?.kind === 'edit-sprint' ? <SprintDialog view={view} sprint={dialog.sprint} onClose={close} /> : null}
      {dialog?.kind === 'carry' ? <CarryDialog view={view} from={dialog.from} onClose={close} /> : null}
    </div>
  );
}

// --- Cabecera del sprint ---------------------------------------------------------

function SprintBar({
  view,
  onSelect,
  onNewSprint,
  onEditSprint,
  onCarry,
  onNewTask,
}: {
  view: TechSprintView;
  onSelect: (id: string) => void;
  onNewSprint: () => void;
  onEditSprint: (sprint: SprintOption) => void;
  onCarry: (from: SprintOption) => void;
  onNewTask: () => void;
}) {
  const { selected, sprints, canManage } = view;
  return (
    <Card className="flex flex-wrap items-center gap-3 p-3">
      {sprints.length > 0 ? (
        <div className="w-full sm:w-56">
          <Select value={selected?.id ?? ''} onChange={(event) => onSelect(event.target.value)} aria-label="Elegir sprint">
            {sprints.map((sprint) => (
              <option key={sprint.id} value={sprint.id}>
                {sprint.name}
                {sprint.isActive ? ' · vigente' : ''}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      {selected ? (
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <CalendarRange className="size-3.5 text-fg-subtle" aria-hidden />
            <span className="capitalize">{dayLabel(selected.startDate)}</span>
            <ArrowRight className="size-3.5 text-fg-subtle" aria-label="hasta" />
            <span className="capitalize">{dayLabel(selected.endDate)}</span>
            {selected.isActive ? <Badge tone="accent">Vigente</Badge> : null}
            <span className="text-xs text-fg-muted tabular-nums">· {hoursLabel(selected.capacityHours)} por persona</span>
          </p>
          {selected.goal ? <p className="text-xs text-fg-muted [overflow-wrap:anywhere]">Objetivo: {selected.goal}</p> : null}
        </div>
      ) : (
        <div className="flex-1" />
      )}
      {canManage ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {selected ? (
            <>
              <Button variant="outline" size="sm" onClick={() => onEditSprint(selected)}>
                <Pencil aria-hidden /> Editar sprint
              </Button>
              {sprints.length > 1 ? (
                <Button variant="outline" size="sm" onClick={() => onCarry(selected)}>
                  <ArrowRight aria-hidden /> Pasar pendientes
                </Button>
              ) : null}
            </>
          ) : null}
          <Button variant="outline" size="sm" onClick={onNewSprint}>
            <CalendarRange aria-hidden /> Nuevo sprint
          </Button>
          <Button size="sm" onClick={onNewTask}>
            <Plus aria-hidden /> Nueva tarea
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

// --- Salud del sprint --------------------------------------------------------------

function Stat({ label, value, hint, children }: { label: string; value: React.ReactNode; hint?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Card className="space-y-1.5 p-3">
      <SectionLabel>{label}</SectionLabel>
      <p className="text-lg font-medium tabular-nums leading-tight">{value}</p>
      {children}
      {hint ? <p className="text-xs text-fg-muted">{hint}</p> : null}
    </Card>
  );
}

function HealthPanel({ view }: { view: TechSprintView }) {
  const health = view.health;
  if (!health) return null;
  const pace = PACE[health.pace];
  const workPct = Math.round(health.workProgress * 100);
  const timePct = Math.round(health.timeProgress * 100);
  const over = health.hours > health.teamCapacity && health.teamCapacity > 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label="Avance"
        value={`${workPct}%`}
        hint={
          health.hours > 0
            ? `${hoursLabel(health.doneHours)} de ${hoursLabel(health.hours)} · ${health.doneTasks}/${health.tasks} tareas`
            : `${health.doneTasks}/${health.tasks} tareas (sin horas estimadas)`
        }
      >
        <Progress value={workPct} label="Trabajo hecho" />
      </Stat>
      <Stat
        label="Calendario"
        value={health.daysLeft > 0 ? `Quedan ${health.daysLeft} d` : 'Cierra hoy'}
        hint={`Día ${health.daysElapsed} de ${health.daysTotal} · ${timePct}% del tiempo`}
      >
        <Progress value={timePct} label="Tiempo consumido" barClassName="bg-fg-subtle" />
      </Stat>
      <Stat
        label="Ritmo"
        value={<Badge tone={pace.tone} className="text-sm">{pace.label}</Badge>}
        hint={
          health.pace === 'BEHIND' || health.pace === 'AT_RISK'
            ? `El trabajo hecho (${workPct}%) va por detrás del tiempo (${timePct}%).`
            : 'Compara lo hecho con el tiempo consumido.'
        }
      />
      <Stat
        label="Capacidad del equipo"
        value={`${hoursLabel(health.hours)} / ${hoursLabel(health.teamCapacity)}`}
        hint={over ? 'Hay más trabajo planificado que horas disponibles.' : `${view.people.length} personas en Tech`}
      >
        <Progress
          value={health.hours}
          max={Math.max(health.teamCapacity, 1)}
          label="Horas planificadas frente a capacidad"
          barClassName={over ? 'bg-[var(--danger)]' : undefined}
        />
      </Stat>
    </div>
  );
}

function RiskStrip({ view, focus, onFocus }: { view: TechSprintView; focus: Focus; onFocus: (focus: Focus) => void }) {
  const { risks } = view;
  const chips: { key: Focus['kind']; count: number; label: string; tone: 'danger' | 'warning' | 'info'; focus?: Focus }[] = [
    { key: 'overdue', count: risks.overdue, label: 'vencidas', tone: 'danger', focus: { kind: 'overdue' } },
    { key: 'unestimated', count: risks.unestimated, label: 'sin horas', tone: 'warning', focus: { kind: 'unestimated' } },
    { key: 'unassigned', count: risks.unassigned, label: 'sin asignar', tone: 'warning', focus: { kind: 'unassigned' } },
    { key: 'all', count: risks.inReview, label: 'esperando revisión de PR', tone: 'info' },
    { key: 'all', count: risks.overloadedPeople, label: risks.overloadedPeople === 1 ? 'persona sobrecargada' : 'personas sobrecargadas', tone: 'danger' },
  ];
  const active = chips.filter((chip) => chip.count > 0);
  if (active.length === 0) {
    return <p className="text-xs text-fg-muted">✅ Sin riesgos: todo estimado, asignado y en fecha.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <SectionLabel className="mr-1">Atención</SectionLabel>
      {active.map((chip) =>
        chip.focus ? (
          <button
            key={chip.label}
            type="button"
            onClick={() => onFocus(focus.kind === chip.key ? { kind: 'all' } : (chip.focus as Focus))}
            aria-pressed={focus.kind === chip.key}
            className={cn('rounded-md', focus.kind === chip.key && 'ring-2 ring-accent')}
          >
            <Badge tone={chip.tone} className="tabular-nums">
              {chip.count} {chip.label}
            </Badge>
          </button>
        ) : (
          <Badge key={chip.label} tone={chip.tone} className="tabular-nums">
            {chip.count} {chip.label}
          </Badge>
        ),
      )}
    </div>
  );
}

// --- Carga por persona -----------------------------------------------------------

function WorkloadTable({ load, focus, onFocus }: { load: PersonLoad[]; focus: Focus; onFocus: (focus: Focus) => void }) {
  if (load.length === 0) return null;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <SectionLabel className="mr-auto">Carga por persona</SectionLabel>
        <span className="text-xs text-fg-subtle">Pulsa una fila para ver solo sus tareas</span>
      </div>
      <ul className="divide-y divide-border">
        {load.map((person) => {
          const selected = focus.kind === 'person' && focus.userId === person.userId;
          return (
            <li key={person.userId ?? 'none'}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onFocus(selected ? { kind: 'all' } : { kind: 'person', userId: person.userId })}
                className={cn(
                  'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2 text-left transition-colors hover:bg-surface-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]',
                  selected && 'bg-surface-2',
                )}
              >
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  {person.userId ? <Avatar name={person.name} /> : null}
                  <span className={cn('truncate', !person.userId && 'text-fg-muted')}>{person.name}</span>
                </span>
                <span className="order-3 col-span-2 sm:order-none sm:col-span-1">
                  {person.userId ? (
                    <Progress
                      value={person.hours}
                      max={Math.max(person.capacity, 1)}
                      label={`Carga de ${person.name}`}
                      className="h-1.5"
                      barClassName={person.overloaded ? 'bg-[var(--danger)]' : undefined}
                    />
                  ) : null}
                </span>
                <span className="flex flex-wrap items-center justify-end gap-1.5 text-xs tabular-nums text-fg-muted">
                  <span className={cn(person.overloaded && 'font-medium text-[var(--danger)]')}>
                    {hoursLabel(person.hours)}
                    {person.userId ? ` / ${hoursLabel(person.capacity)}` : ''}
                  </span>
                  <span>
                    · {person.doneTasks}/{person.tasks} hechas
                  </span>
                  {person.overloaded ? <Badge tone="danger">⚠️ Sobrecarga</Badge> : null}
                  {person.overdue > 0 ? <Badge tone="danger">{person.overdue} vencidas</Badge> : null}
                  {person.unestimated > 0 ? <Badge tone="warning">{person.unestimated} sin horas</Badge> : null}
                  {person.userId && person.tasks === 0 ? <Badge tone="neutral">Libre</Badge> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// --- Tablero -------------------------------------------------------------------------

function Column({
  status,
  tasks,
  view,
  myUserId,
}: {
  status: TaskStatus;
  tasks: DeptTaskView[];
  view: TechSprintView;
  myUserId: string;
}) {
  const move = useAction(moveDeptTaskAction);
  const [over, setOver] = React.useState(false);
  const hours = tasks.reduce((sum, task) => sum + (task.estimatedHours ?? 0), 0);

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
      className={cn(
        'flex min-h-32 flex-col gap-2 rounded-lg border bg-surface-2 p-2 transition-colors',
        over ? 'border-accent' : 'border-border',
      )}
    >
      <div className="flex items-center gap-2 px-1">
        <SectionLabel className="mr-auto">{TASK_STATUS_LABELS[status]}</SectionLabel>
        <span className="text-xs tabular-nums text-fg-subtle">
          {tasks.length} · {hoursLabel(hours)}
        </span>
      </div>
      <ActionError message={move.error} />
      <ul className="space-y-2">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} view={view} myUserId={myUserId} />
        ))}
      </ul>
    </section>
  );
}

function TaskCard({ task, view, myUserId }: { task: DeptTaskView; view: TechSprintView; myUserId: string }) {
  const move = useAction(moveDeptTaskAction);
  const assign = useAction(assignDeptTaskAction, { success: 'Tarea asignada' });
  const plan = useAction(planDeptTaskAction);

  const index = TASK_STATUSES.indexOf(task.status);
  const prev = TASK_STATUSES[index - 1];
  const next = TASK_STATUSES[index + 1];
  const overdue = isOverdue(task, view.today);
  const busy = move.isPending || assign.isPending || plan.isPending;

  return (
    <li>
      <Card
        className={cn('space-y-2 p-2.5', overdue && 'border-[var(--danger)]')}
        draggable={task.canMove}
        onDragStart={(event: React.DragEvent) => event.dataTransfer.setData('text/plain', task.id)}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {task.code ? <span className="font-mono text-xs text-fg-subtle">{task.code}</span> : null}
          {task.pullRequest ? <PullRequestBadge task={task} /> : null}
          {task.initiativeId ? <Badge tone="info">{task.initiativeId}</Badge> : null}
        </div>
        <p
          className={cn(
            'text-sm font-medium [overflow-wrap:anywhere]',
            task.status === 'DONE' ? 'text-fg-muted line-through' : 'text-fg',
          )}
        >
          {task.title}
        </p>
        {task.description ? (
          <p className="line-clamp-3 text-xs text-fg-muted [overflow-wrap:anywhere]">{task.description}</p>
        ) : null}

        {task.canManage ? (
          <div className="space-y-1.5">
            <Select
              value={task.assigneeId ?? ''}
              disabled={busy}
              aria-label={`Asignar “${task.title}”`}
              onChange={(event) => assign.run({ taskId: task.id, assigneeId: event.target.value || null })}
            >
              <option value="">Sin asignar</option>
              {view.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-1.5">
              {/* `key` reinicia el borrador cuando el servidor devuelve otro valor. */}
              <HoursField
                key={`hours-${task.estimatedHours ?? ''}`}
                value={task.estimatedHours}
                disabled={busy}
                label={`Horas de “${task.title}”`}
                onCommit={(estimatedHours) => plan.run({ taskId: task.id, estimatedHours })}
              />
              <DueDateField
                key={`due-${task.dueDate ?? ''}`}
                value={task.dueDate}
                overdue={overdue}
                disabled={busy}
                label={`Fecha límite de “${task.title}”`}
                onCommit={(dueDate) => plan.run({ taskId: task.id, dueDate })}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={task.isMine ? 'success' : 'neutral'}>{task.isMine ? 'Tuya' : (task.assigneeName ?? 'Sin asignar')}</Badge>
            {task.estimatedHours !== null ? <Badge tone="neutral">{hoursLabel(task.estimatedHours)}</Badge> : null}
            {task.dueDate ? (
              <Badge tone={overdue ? 'danger' : 'neutral'}>
                {overdue ? 'Vencida · ' : ''}
                <span className="capitalize">{dayLabel(task.dueDate)}</span>
              </Badge>
            ) : null}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1">
          {task.canMove && prev ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => move.run({ taskId: task.id, status: prev })}
              aria-label={`Mover a ${TASK_STATUS_LABELS[prev]}`}
              title={TASK_STATUS_LABELS[prev]}
            >
              <ArrowLeft aria-hidden />
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
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              disabled={busy}
              onClick={() => plan.run({ taskId: task.id, sprintId: null })}
              title="Devolver al backlog"
            >
              <Undo2 aria-hidden /> Backlog
            </Button>
          ) : null}
        </div>
        <ActionError message={move.error ?? assign.error ?? plan.error} />
      </Card>
    </li>
  );
}

function PullRequestBadge({ task }: { task: DeptTaskView }) {
  const pr = task.pullRequest;
  if (!pr) return null;
  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${pr.repo} · ${pr.title}`}
      className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Badge tone={PR_TONE[pr.state]}>
        <GitPullRequest className="size-3" aria-hidden />#{pr.number} · {PULL_REQUEST_STATE_LABELS[pr.state].replace('PR ', '')}
        <ExternalLink className="size-3" aria-hidden />
      </Badge>
    </a>
  );
}

/** Campo de horas: guarda al salir del campo o con Intro; vacío = sin estimar. */
function HoursField({
  value,
  disabled,
  label,
  onCommit,
}: {
  value: number | null;
  disabled: boolean;
  label: string;
  onCommit: (hours: number | null) => void;
}) {
  const [draft, setDraft] = React.useState(value === null ? '' : String(value));

  const commit = (): void => {
    const trimmed = draft.trim().replace(',', '.');
    const next = trimmed === '' ? null : Number(trimmed);
    if (next !== null && (!Number.isFinite(next) || next < 0 || next > MAX_TASK_HOURS)) {
      setDraft(value === null ? '' : String(value));
      toast(`Las horas van de 0 a ${MAX_TASK_HOURS}.`);
      return;
    }
    const rounded = next === null ? null : Math.round(next * 2) / 2;
    if (rounded !== value) onCommit(rounded);
  };

  return (
    <div className="relative">
      <Input
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        placeholder="—"
        aria-label={label}
        title="Horas estimadas"
        className="pr-5 tabular-nums"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
        }}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-fg-subtle">h</span>
    </div>
  );
}

/** Fecha límite: guarda al salir del campo para no grabar a medio teclear. */
function DueDateField({
  value,
  overdue,
  disabled,
  label,
  onCommit,
}: {
  value: string | null;
  overdue: boolean;
  disabled: boolean;
  label: string;
  onCommit: (dueDate: string | null) => void;
}) {
  const [draft, setDraft] = React.useState(value ?? '');
  return (
    <Input
      type="date"
      value={draft}
      disabled={disabled}
      aria-label={label}
      title={overdue ? 'Vencida' : 'Fecha límite'}
      className={cn('tabular-nums', overdue && 'border-[var(--danger)] text-[var(--danger)]')}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft || null;
        if (next !== value) onCommit(next);
      }}
    />
  );
}

// --- Backlog ---------------------------------------------------------------------------

function Backlog({ view }: { view: TechSprintView }) {
  const plan = useAction(planDeptTaskAction, { success: 'Tarea añadida al sprint' });
  const { backlog, selected, canManage } = view;
  // Con un sprint abierto el foco es el sprint: el backlog arranca plegado.
  const [open, setOpen] = React.useState(!selected);
  if (backlog.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left"
      >
        <SectionLabel className="mr-auto">Backlog sin sprint ({backlog.length})</SectionLabel>
        <span className="text-xs text-fg-subtle">{open ? 'Ocultar' : 'Mostrar'}</span>
      </button>
      {open ? (
        <ul className="divide-y divide-border">
          {backlog.map((task) => (
            <li key={task.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              {task.code ? <span className="font-mono text-xs text-fg-subtle">{task.code}</span> : null}
              <span className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">{task.title}</span>
              <span className="text-xs text-fg-muted tabular-nums">
                {task.assigneeName ?? 'Sin asignar'}
                {task.estimatedHours !== null ? ` · ${hoursLabel(task.estimatedHours)}` : ' · sin horas'}
              </span>
              {canManage && selected ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={plan.isPending}
                  onClick={() =>
                    plan.run({ taskId: task.id, sprintId: selected.id, dueDate: task.dueDate ?? selected.endDate })
                  }
                >
                  <ListPlus aria-hidden /> Al sprint
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="px-3">
        <ActionError message={plan.error} />
      </div>
    </Card>
  );
}

function GitHubHint({ configured, canManage }: { configured: boolean; canManage: boolean }) {
  return (
    <Card className="flex items-start gap-2.5 p-3 text-xs text-fg-muted">
      <GitPullRequest className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden />
      <div className="space-y-1">
        <p>
          Para que un PR mueva su tarea, cita la clave en la rama o en el título, por ejemplo{' '}
          <code className="rounded bg-surface-2 px-1 font-mono">feat/TEC-12-login</code>. Borrador → En curso, abierto →
          En revisión, fusionado → Hecha.
        </p>
        {!configured && canManage ? (
          <p className="text-[var(--warning)]">
            ⚠️ El webhook de GitHub aún no está configurado (falta <code className="font-mono">GITHUB_WEBHOOK_SECRET</code>
            ): por ahora las tareas solo se mueven a mano.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

// --- Diálogos ------------------------------------------------------------------------------

function TaskDialog({ view, onClose }: { view: TechSprintView; onClose: () => void }) {
  const create = useAction(createDeptTaskAction, { success: 'Tarea creada' });
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [assigneeId, setAssigneeId] = React.useState('');
  const [hours, setHours] = React.useState('');
  const [sprintId, setSprintId] = React.useState(view.selected?.id ?? '');
  const sprintEnd = view.sprints.find((sprint) => sprint.id === sprintId)?.endDate ?? '';
  const [dueDate, setDueDate] = React.useState(sprintEnd);

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const parsedHours = hours.trim() === '' ? null : Number(hours.replace(',', '.'));
    if (parsedHours !== null && !Number.isFinite(parsedHours)) {
      create.setError('Las horas deben ser un número.');
      return;
    }
    create.run(
      {
        title,
        description,
        department: 'TECH',
        assigneeId: assigneeId || null,
        estimatedHours: parsedHours === null ? null : Math.round(parsedHours * 2) / 2,
        sprintId: sprintId || null,
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
            <DialogTitle>Nueva tarea de Tech</DialogTitle>
            <DialogDescription>Recibirá una clave TEC-n para enlazarla desde la rama o el PR.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tech-title">Título</Label>
              <Input id="tech-title" value={title} maxLength={MAX_TASK_TITLE} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tech-description">Descripción (opcional)</Label>
              <Textarea
                id="tech-description"
                rows={3}
                value={description}
                maxLength={MAX_TASK_DESCRIPTION}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tech-assignee">Responsable</Label>
                <Select id="tech-assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                  <option value="">Sin asignar</option>
                  {view.people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tech-hours">Horas estimadas</Label>
                <Input
                  id="tech-hours"
                  inputMode="decimal"
                  placeholder="p. ej. 4 o 2.5"
                  value={hours}
                  onChange={(event) => setHours(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tech-sprint">Sprint</Label>
                <Select
                  id="tech-sprint"
                  value={sprintId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    const nextEnd = view.sprints.find((sprint) => sprint.id === nextId)?.endDate ?? '';
                    // La fecha sigue al cierre del sprint mientras no se haya tocado a mano.
                    if (dueDate === sprintEnd) setDueDate(nextEnd);
                    setSprintId(nextId);
                  }}
                >
                  <option value="">Backlog (sin sprint)</option>
                  {view.sprints.map((sprint) => (
                    <option key={sprint.id} value={sprint.id}>
                      {sprint.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tech-due">Fecha límite</Label>
                <Input id="tech-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </div>
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

function SprintDialog({ view, sprint, onClose }: { view: TechSprintView; sprint?: SprintOption; onClose: () => void }) {
  const router = useRouter();
  const create = useAction(createSprintAction, { success: 'Sprint abierto' });
  const update = useAction(updateSprintAction);
  const action = sprint ? update : create;
  const base = sprint ?? { ...view.suggestion, goal: '' };

  const [name, setName] = React.useState(base.name);
  const [goal, setGoal] = React.useState(base.goal);
  const [startDate, setStartDate] = React.useState(base.startDate);
  const [endDate, setEndDate] = React.useState(base.endDate);
  const [capacity, setCapacity] = React.useState(String(base.capacityHours));
  const [shiftDueDates, setShiftDueDates] = React.useState(true);

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const capacityHours = Number(capacity.replace(',', '.'));
    if (!Number.isFinite(capacityHours)) {
      action.setError('La capacidad debe ser un número de horas.');
      return;
    }
    const payload = { name, goal, startDate, endDate, capacityHours: Math.round(capacityHours * 2) / 2 };
    if (sprint) {
      update.run({ sprintId: sprint.id, ...payload, shiftDueDates }, ({ shiftedTasks }) => {
        toast(shiftedTasks > 0 ? `Sprint actualizado · ${shiftedTasks} fechas movidas al nuevo cierre` : 'Sprint actualizado');
        onClose();
      });
    } else {
      create.run(payload, ({ id }) => {
        onClose();
        router.push(`/tech?sprint=${encodeURIComponent(id)}` as Route);
      });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{sprint ? 'Editar sprint' : 'Nuevo sprint'}</DialogTitle>
            <DialogDescription>
              La cadencia habitual es de miércoles a miércoles; cambia las fechas si esta semana es distinta.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
              <div className="space-y-1.5">
                <Label htmlFor="sprint-name">Nombre</Label>
                <Input id="sprint-name" value={name} maxLength={MAX_SPRINT_NAME} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sprint-capacity">Horas por persona</Label>
                <Input
                  id="sprint-capacity"
                  inputMode="decimal"
                  value={capacity}
                  max={MAX_SPRINT_CAPACITY}
                  onChange={(event) => setCapacity(event.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sprint-start">Empieza</Label>
                <Input id="sprint-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sprint-end">Cierra</Label>
                <Input id="sprint-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sprint-goal">Objetivo (opcional)</Label>
              <Textarea id="sprint-goal" rows={2} value={goal} maxLength={MAX_SPRINT_GOAL} onChange={(event) => setGoal(event.target.value)} />
            </div>
            {sprint && endDate !== sprint.endDate ? (
              <label className="flex items-start gap-2 text-xs text-fg-muted">
                <input type="checkbox" className="mt-0.5" checked={shiftDueDates} onChange={(event) => setShiftDueDates(event.target.checked)} />
                Mover también la fecha límite de las tareas abiertas que vencían el cierre anterior.
              </label>
            ) : null}
            <ActionError message={action.error} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={action.isPending}>
              {sprint ? 'Guardar cambios' : 'Abrir sprint'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CarryDialog({ view, from, onClose }: { view: TechSprintView; from: SprintOption; onClose: () => void }) {
  const carry = useAction(carryOverSprintAction);
  const targets = view.sprints.filter((sprint) => sprint.id !== from.id);
  // Lo natural es pasar al sprint siguiente; si no hay, al más reciente.
  const following = [...targets].filter((sprint) => sprint.startDate >= from.startDate).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const [toSprintId, setToSprintId] = React.useState(following?.id ?? targets[0]?.id ?? '');
  const pending = view.tasks.filter((task) => task.status !== 'DONE').length;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pasar pendientes de {from.name}</DialogTitle>
          <DialogDescription>
            {pending === 1 ? 'La tarea sin terminar pasa' : `Las ${pending} tareas sin terminar pasan`} al sprint que elijas. Las
            que vencían al cierre toman el cierre del nuevo sprint.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="carry-target">Sprint destino</Label>
            <Select id="carry-target" value={toSprintId} onChange={(event) => setToSprintId(event.target.value)}>
              {targets.map((sprint) => (
                <option key={sprint.id} value={sprint.id}>
                  {sprint.name} · {dayLabel(sprint.startDate)} → {dayLabel(sprint.endDate)}
                </option>
              ))}
            </Select>
          </div>
          <ActionError message={carry.error} />
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={carry.isPending || !toSprintId || pending === 0}
            onClick={() =>
              carry.run({ fromSprintId: from.id, toSprintId }, ({ moved }) => {
                toast(moved === 1 ? '1 tarea pasada al otro sprint' : `${moved} tareas pasadas al otro sprint`);
                onClose();
              })
            }
          >
            Pasar {pending} {pending === 1 ? 'tarea' : 'tareas'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
