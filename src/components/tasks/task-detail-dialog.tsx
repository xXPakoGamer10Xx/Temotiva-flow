'use client';

import * as React from 'react';
import { History, Pencil, Trash2 } from 'lucide-react';
import { TASK_NOTE_KINDS } from '@/domain/enums';
import type { TaskNoteKind } from '@/domain/enums';
import { DEPARTMENT_LABELS, TASK_NOTE_KIND_LABELS, TASK_STATUS_LABELS } from '@/domain/labels';
import { MAX_TASK_NOTE, MIN_TASK_NOTE } from '@/domain/rules';
import { noteLength } from '@/domain/task-note';
import {
  addTaskNoteAction,
  editTaskNoteAction,
  listTaskNoteRevisionsAction,
  removeTaskNoteAction,
} from '@/server/actions/dept-task-notes';
import type { DeptTaskView } from '@/server/services/dept-tasks';
import type { DeptTaskNoteView, TaskNoteRevisionView } from '@/server/services/dept-task-notes';
import { ActionError, useAction } from '@/lib/use-action';
import { cn, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge, Label, SectionLabel, Select, Textarea } from '@/components/ui/primitives';
import { TaskNoteKindBadge } from './task-note-signal';

/**
 * Spec 006: detalle de una tarea de área con su descripción completa y sus
 * notas de seguimiento. Mismo componente en `/tareas` y `/tech`.
 *
 * Solo pinta: quién añade, edita o retira lo decide el servidor
 * (`dept-task-notes.ts`). Las notas llegan ya filtradas por visibilidad.
 */

export function TaskDetailDialog({ task, onClose }: { task: DeptTaskView; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="w-[min(40rem,calc(100vw-2rem))]">
        <DialogHeader className="space-y-1.5 pr-12">
          <DialogTitle className="[overflow-wrap:anywhere]">{task.title}</DialogTitle>
          <DialogDescription>
            {task.code ? <span className="font-mono">{task.code} · </span> : null}
            {DEPARTMENT_LABELS[task.department]} · {TASK_STATUS_LABELS[task.status]} ·{' '}
            {task.assigneeName ?? 'Sin asignar'}
            {task.initiativeId ? ` · ${task.initiativeId}` : ''}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <section className="space-y-1.5" aria-labelledby="task-detail-description">
            <SectionLabel id="task-detail-description">Descripción</SectionLabel>
            {task.description ? (
              <p className="whitespace-pre-wrap text-sm text-fg [overflow-wrap:anywhere]">{task.description}</p>
            ) : (
              <p className="text-xs text-fg-muted">Sin descripción.</p>
            )}
          </section>

          <section className="space-y-3" aria-labelledby="task-detail-notes">
            <SectionLabel id="task-detail-notes">Seguimiento ({task.noteCount})</SectionLabel>
            {task.canAddNote ? (
              <NewNoteForm taskId={task.id} />
            ) : task.status === 'DONE' ? (
              <p className="text-xs text-fg-muted">La tarea está hecha: sus notas son de solo lectura.</p>
            ) : null}
            {task.notes.length === 0 ? (
              <p className="text-xs text-fg-muted">Aún no hay notas de seguimiento.</p>
            ) : (
              <ol className="space-y-2">
                {task.notes.map((note) => (
                  <NoteItem key={note.id} note={note} />
                ))}
              </ol>
            )}
          </section>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function KindSelect({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: TaskNoteKind;
  disabled?: boolean;
  onChange: (kind: TaskNoteKind) => void;
}) {
  return (
    <Select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as TaskNoteKind)}>
      {TASK_NOTE_KINDS.map((kind) => (
        <option key={kind} value={kind}>
          {TASK_NOTE_KIND_LABELS[kind]}
        </option>
      ))}
    </Select>
  );
}

/** Contador de la nota: siempre visible, porque el máximo es corto. */
function NoteCounter({ body, id }: { body: string; id: string }) {
  const length = noteLength(body.trim());
  const nearLimit = MAX_TASK_NOTE - length <= 100;
  return (
    <p id={id} className={cn('text-xs tabular-nums', nearLimit ? 'tone-warning w-fit rounded px-1' : 'text-fg-subtle')}>
      {length}/{MAX_TASK_NOTE}
    </p>
  );
}

const isValidBody = (body: string): boolean => {
  const length = noteLength(body.trim());
  return length >= MIN_TASK_NOTE && length <= MAX_TASK_NOTE;
};

function NewNoteForm({ taskId }: { taskId: string }) {
  const add = useAction(addTaskNoteAction, { success: 'Nota añadida' });
  const [kind, setKind] = React.useState<TaskNoteKind>('UPDATE');
  const [body, setBody] = React.useState('');

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    add.run({ taskId, kind, body }, () => {
      setBody('');
      setKind('UPDATE');
    });
  };

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-border bg-surface-2 p-3">
      <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label htmlFor={`note-kind-${taskId}`}>Tipo</Label>
          <KindSelect id={`note-kind-${taskId}`} value={kind} disabled={add.isPending} onChange={setKind} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`note-body-${taskId}`}>Añadir nota</Label>
          <Textarea
            id={`note-body-${taskId}`}
            rows={3}
            value={body}
            maxLength={MAX_TASK_NOTE + 50}
            className="max-h-48 overflow-y-auto"
            aria-describedby={`note-count-${taskId}`}
            placeholder="Qué ha cambiado, a qué se espera o qué la bloquea"
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
      </div>
      {kind !== 'UPDATE' ? (
        <p className="text-xs text-fg-muted">
          La tarjeta mostrará la señal hasta que alguien añada una nota de seguimiento. No bloquea la iniciativa.
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <NoteCounter body={body} id={`note-count-${taskId}`} />
        <Button type="submit" size="sm" className="ml-auto" disabled={add.isPending || !isValidBody(body)}>
          Añadir nota
        </Button>
      </div>
      <ActionError message={add.error} />
    </form>
  );
}

function NoteItem({ note }: { note: DeptTaskNoteView }) {
  const [editing, setEditing] = React.useState(false);
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);
  const remove = useAction(removeTaskNoteAction, { success: 'Nota retirada' });

  return (
    <li className="space-y-1.5 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
        <TaskNoteKindBadge kind={note.kind} />
        <span className="text-fg">{note.isMine ? 'Tú' : note.authorName}</span>
        <span>· {note.authorDepartmentLabel}</span>
        <time dateTime={note.createdAt} className="tabular-nums">
          · {formatDateTime(note.createdAt)}
        </time>
        {note.isEdited ? (
          <span title={note.editedAt ? `Editada ${formatDateTime(note.editedAt)}` : undefined}>· editada</span>
        ) : null}
        {!editing && (note.canEdit || note.canRemove) ? (
          <span className="ml-auto flex items-center gap-0.5">
            {note.canEdit ? (
              <IconButton label="Editar nota" onClick={() => setEditing(true)} disabled={remove.isPending}>
                <Pencil className="size-3.5" aria-hidden />
              </IconButton>
            ) : null}
            {note.canRemove ? (
              <IconButton
                label="Retirar nota"
                danger
                onClick={() => setConfirmingRemove(true)}
                disabled={remove.isPending}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </IconButton>
            ) : null}
          </span>
        ) : null}
      </div>

      {editing ? (
        <EditNoteForm note={note} onDone={() => setEditing(false)} />
      ) : (
        <p className="whitespace-pre-wrap text-sm text-fg [overflow-wrap:anywhere]">{note.body}</p>
      )}

      {confirmingRemove ? (
        <div role="group" aria-label="Confirmar retirada" className="tone-danger flex flex-wrap items-center gap-2 rounded-md px-2.5 py-1.5 text-xs">
          <span className="mr-auto">¿Retirar esta nota? Dejará de verse, pero queda guardada.</span>
          <Button size="sm" variant="outline" disabled={remove.isPending} onClick={() => setConfirmingRemove(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={remove.isPending}
            onClick={() => remove.run({ noteId: note.id }, () => setConfirmingRemove(false))}
          >
            Retirar
          </Button>
        </div>
      ) : null}
      <ActionError message={remove.error} />

      {/* `key`: tras una edición se descarta la lista ya cargada. */}
      {note.revisionsCount > 0 ? <Revisions key={note.version} noteId={note.id} count={note.revisionsCount} /> : null}
    </li>
  );
}

function IconButton({
  label,
  danger,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 disabled:opacity-50',
        danger ? 'hover:text-[var(--danger)]' : 'hover:text-fg',
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function EditNoteForm({ note, onDone }: { note: DeptTaskNoteView; onDone: () => void }) {
  const edit = useAction(editTaskNoteAction, { success: 'Nota editada' });
  const [kind, setKind] = React.useState<TaskNoteKind>(note.kind);
  const [body, setBody] = React.useState(note.body);
  const unchanged = kind === note.kind && body.trim() === note.body;

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    // `expectedVersion`: si otra persona la cambió entretanto, el servidor rechaza la edición.
    edit.run({ noteId: note.id, expectedVersion: note.version, kind, body }, onDone);
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
        {/* El envoltorio evita que la celda estire el selector y descoloque su flecha. */}
        <div className="self-start">
          <KindSelect id={`edit-kind-${note.id}`} value={kind} disabled={edit.isPending} onChange={setKind} />
        </div>
        <Textarea
          aria-label="Texto de la nota"
          rows={3}
          value={body}
          maxLength={MAX_TASK_NOTE + 50}
          className="max-h-48 overflow-y-auto"
          aria-describedby={`edit-count-${note.id}`}
          onChange={(event) => setBody(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <NoteCounter body={body} id={`edit-count-${note.id}`} />
        <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={onDone} disabled={edit.isPending}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={edit.isPending || unchanged || !isValidBody(body)}>
          Guardar
        </Button>
      </div>
      <ActionError message={edit.error} />
    </form>
  );
}

/** Versiones anteriores, solo bajo demanda (spec 006 §7.6). */
function Revisions({ noteId, count }: { noteId: string; count: number }) {
  const [revisions, setRevisions] = React.useState<TaskNoteRevisionView[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const load = (): void => {
    setError(null);
    startTransition(async () => {
      const result = await listTaskNoteRevisionsAction({ noteId });
      if (result.ok) setRevisions(result.data);
      else setError(result.message);
    });
  };

  if (revisions === null) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={load}
          disabled={isPending}
          className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg disabled:opacity-50"
        >
          <History className="size-3.5" aria-hidden />
          {isPending ? 'Cargando…' : `Ver versiones anteriores (${count})`}
        </button>
        <ActionError message={error} />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setRevisions(null)}
        className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
      >
        <History className="size-3.5" aria-hidden /> Ocultar versiones anteriores
      </button>
      <ol className="space-y-2 border-l border-border pl-3">
        {revisions.map((revision) => (
          <li key={revision.version} className="space-y-0.5">
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
              <Badge tone="neutral" className="tabular-nums">
                v{revision.version}
              </Badge>
              <span>{TASK_NOTE_KIND_LABELS[revision.kind]}</span>
              <span className="tabular-nums">
                · sustituida por {revision.replacedByName} el {formatDateTime(revision.replacedAt)}
              </span>
            </p>
            <p className="whitespace-pre-wrap text-xs text-fg-muted [overflow-wrap:anywhere]">{revision.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
