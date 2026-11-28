import { MessageSquare } from 'lucide-react';
import { TASK_NOTE_KIND_GLYPHS, TASK_NOTE_KIND_LABELS } from '@/domain/labels';
import type { TaskNoteKind } from '@/domain/enums';
import type { DeptTaskView } from '@/server/services/dept-tasks';
import { Badge } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/**
 * Spec 006 §4.3: indicador de notas en la tarjeta. La señal (⏳ / ⛔) es solo
 * informativa; nunca refleja ni cambia el bloqueo de la iniciativa.
 */

const KIND_TONE: Record<TaskNoteKind, 'neutral' | 'warning' | 'danger'> = {
  UPDATE: 'neutral',
  WAITING: 'warning',
  BLOCKED: 'danger',
};

/** Etiqueta del tipo de nota, con su pictograma oculto a lectores de pantalla. */
export function TaskNoteKindBadge({ kind, className }: { kind: TaskNoteKind; className?: string }) {
  const glyph = TASK_NOTE_KIND_GLYPHS[kind];
  return (
    <Badge tone={KIND_TONE[kind]} className={className}>
      {glyph ? <span aria-hidden="true">{glyph}</span> : null} {TASK_NOTE_KIND_LABELS[kind]}
    </Badge>
  );
}

export function TaskNoteSignal({
  task,
}: {
  task: Pick<DeptTaskView, 'noteSignal' | 'noteCount' | 'hasRecentNote'>;
}) {
  if (task.noteSignal) return <TaskNoteKindBadge kind={task.noteSignal} />;
  if (task.noteCount === 0) return null;
  const label = `${task.noteCount} ${task.noteCount === 1 ? 'nota' : 'notas'} de seguimiento${task.hasRecentNote ? ', con novedades' : ''}`;
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs tabular-nums', task.hasRecentNote ? 'text-accent-text' : 'text-fg-muted')}
      title={label}
    >
      <MessageSquare className="size-3.5" aria-hidden />
      <span className="sr-only">{label}</span>
      <span aria-hidden="true">{task.noteCount}</span>
      {task.hasRecentNote ? (
        <Badge tone="accent" aria-hidden="true">
          Nueva
        </Badge>
      ) : null}
    </span>
  );
}
