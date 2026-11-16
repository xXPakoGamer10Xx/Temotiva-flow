'use client';

import * as React from 'react';
import { elapsedBetween, formatDuration } from '@/domain/task-read';
import { markDeptTaskReadAction } from '@/server/actions/dept-tasks';
import type { DeptTaskView } from '@/server/services/dept-tasks';
import type { ReadCycleView, ReadHistoryItem } from '@/server/services/dept-task-reads';
import { ActionError, useAction } from '@/lib/use-action';
import { formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/primitives';

/**
 * Lectura y tiempos de una tarea de área (spec 003, RF-10..RF-13). Solo pinta:
 * quién puede marcar lo decide el servidor (`markDeptTaskRead`).
 */

const sinceNow = (iso: string): string => formatDuration(Date.now() - new Date(iso).getTime());

function ReadBadge({ cycle }: { cycle: ReadCycleView }) {
  if (cycle.state === 'NO_DATA') return <Badge tone="neutral">Sin datos de lectura</Badge>;
  if (cycle.state === 'UNREAD') {
    return (
      <Badge tone="warning">
        Sin leer
        {cycle.assignedAt ? (
          <span className="tabular-nums" suppressHydrationWarning>
            {' '}
            · hace {sinceNow(cycle.assignedAt)}
          </span>
        ) : null}
      </Badge>
    );
  }
  const exact = cycle.readAt ? formatDateTime(cycle.readAt) : '';
  return (
    <Badge tone="success" title={`${cycle.readSource === 'AUTO' ? 'Leída al moverla' : 'Marcada como leída'} · ${exact}`}>
      <span aria-hidden="true">✅</span> Leída
    </Badge>
  );
}

/** «Tardó X en leer», «Resuelta en Y», «En curso desde hace Y» o «Hecha sin lectura confirmada». */
function ReadTimes({ cycle, status }: { cycle: ReadCycleView; status: DeptTaskView['status'] }) {
  if (cycle.state === 'NO_DATA') return null;
  const toRead = elapsedBetween(cycle.assignedAt, cycle.readAt);
  const toResolve = elapsedBetween(cycle.readAt, cycle.resolvedAt);
  const parts: React.ReactNode[] = [];
  if (toRead !== null) parts.push(`Tardó ${formatDuration(toRead)} en leer`);
  if (toResolve !== null) parts.push(`Resuelta en ${formatDuration(toResolve)}`);
  else if (cycle.resolvedAt && !cycle.readAt) parts.push('Hecha sin lectura confirmada');
  else if (cycle.readAt && !cycle.resolvedAt) {
    parts.push(
      // Leída pero aún en «Por hacer»: decir «en curso» confundiría.
      <span key="since" suppressHydrationWarning>
        {status === 'TODO' ? 'Leída hace' : 'En curso desde hace'} {sinceNow(cycle.readAt)}
      </span>,
    );
  }
  if (parts.length === 0) return null;
  return (
    <p className="flex flex-wrap gap-x-2 text-xs tabular-nums text-fg-muted">
      {parts.map((part, index) => (
        <span key={index}>{part}</span>
      ))}
    </p>
  );
}

function HistoryRow({ item }: { item: ReadHistoryItem }) {
  const read = item.readAt
    ? `leída ${formatDateTime(item.readAt)}${item.readSource === 'AUTO' ? ' (al moverla)' : ''}`
    : 'sin leer';
  return (
    <li>
      <span className="text-fg">{item.assigneeName}</span> · asignada {item.assignedAt ? formatDateTime(item.assignedAt) : '—'} ·{' '}
      {read}
      {item.resolvedAt ? ` · resuelta ${formatDateTime(item.resolvedAt)}` : ''} · cerrada {formatDateTime(item.closedAt)}
    </li>
  );
}

export function TaskReadStatus({
  task,
}: {
  task: Pick<DeptTaskView, 'id' | 'isMine' | 'status' | 'readCycle' | 'readHistory'>;
}) {
  const mark = useAction(markDeptTaskReadAction, { success: 'Tarea marcada como leída' });
  const cycle = task.readCycle;
  const canMark = task.isMine && cycle !== null && cycle.state !== 'READ';

  if (!cycle && task.readHistory.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {cycle ? (
        <div className="flex flex-wrap items-center gap-2">
          <ReadBadge cycle={cycle} />
          {canMark ? (
            <label className="flex items-center gap-1.5 text-xs text-fg-muted">
              <input
                type="checkbox"
                checked={false}
                disabled={mark.isPending}
                onChange={() => mark.run({ taskId: task.id })}
              />
              Marcar como leída
            </label>
          ) : null}
        </div>
      ) : null}
      {cycle ? <ReadTimes cycle={cycle} status={task.status} /> : null}
      {task.readHistory.length > 0 ? (
        <details className="text-xs text-fg-muted">
          <summary className="cursor-pointer select-none">Historial ({task.readHistory.length})</summary>
          <ol className="mt-1 space-y-1 border-l border-border pl-3 tabular-nums">
            {task.readHistory.map((item) => (
              <HistoryRow key={item.id} item={item} />
            ))}
          </ol>
        </details>
      ) : null}
      <ActionError message={mark.error} />
    </div>
  );
}
