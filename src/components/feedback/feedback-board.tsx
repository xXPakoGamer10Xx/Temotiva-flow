'use client';

import * as React from 'react';
import { Send } from 'lucide-react';
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES } from '@/domain/enums';
import type { FeedbackCategory, FeedbackStatus } from '@/domain/enums';
import { FEEDBACK_CATEGORY_LABELS, FEEDBACK_STATUS_LABELS } from '@/domain/labels';
import { createFeedbackAction, setFeedbackStatusAction } from '@/server/actions/feedback';
import { MAX_FEEDBACK_MESSAGE, MIN_FEEDBACK_MESSAGE } from '@/domain/rules';
import type { FeedbackView } from '@/server/services/feedback';
import { ActionError, useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, Label, SectionLabel, Select, Textarea } from '@/components/ui/primitives';
import { cn, formatRelative } from '@/lib/utils';

const STATUS_TONE: Record<FeedbackStatus, 'warning' | 'info' | 'success'> = {
  PENDING: 'warning',
  IN_PROGRESS: 'info',
  DONE: 'success',
};

type Filter = 'ALL' | FeedbackStatus;

export function FeedbackBoard({ items, canManage }: { items: FeedbackView[]; canManage: boolean }) {
  const create = useAction(createFeedbackAction, { success: 'Gracias, recibimos tu feedback' });
  const [category, setCategory] = React.useState<FeedbackCategory>('APP');
  const [message, setMessage] = React.useState('');
  const [filter, setFilter] = React.useState<Filter>('ALL');

  const visible = filter === 'ALL' ? items : items.filter((item) => item.status === filter);
  const canSend = message.trim().length >= MIN_FEEDBACK_MESSAGE && !create.isPending;

  return (
    <>
      <Card className="space-y-3 p-4">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSend) create.run({ category, message }, () => setMessage(''));
          }}
        >
          <div className="space-y-1.5 sm:max-w-xs">
            <Label htmlFor="feedback-category">¿De qué es el feedback?</Label>
            <Select
              id="feedback-category"
              value={category}
              onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
            >
              {FEEDBACK_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {FEEDBACK_CATEGORY_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="feedback-message">Tu feedback</Label>
            <Textarea
              id="feedback-message"
              rows={4}
              maxLength={MAX_FEEDBACK_MESSAGE}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Qué pasó, qué esperabas o qué te gustaría que hiciera. Sin datos de pacientes."
            />
          </div>
          <ActionError message={create.error} />
          <Button type="submit" size="sm" disabled={!canSend}>
            <Send className="size-3.5" />
            {create.isPending ? 'Enviando…' : 'Enviar feedback'}
          </Button>
        </form>
      </Card>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Feedback · {items.length} en total</SectionLabel>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
            {(['ALL', ...FEEDBACK_STATUSES] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  'h-7 rounded-md px-2 text-xs font-medium transition-colors',
                  filter === value ? 'tone-accent' : 'border border-border text-fg-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                {value === 'ALL' ? 'Todos' : FEEDBACK_STATUS_LABELS[value]}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState title="Sin feedback" description="Aquí aparecerá lo que envíe el equipo." />
        ) : (
          <ul className="space-y-2">
            {visible.map((item) => (
              <FeedbackRow key={item.id} item={item} canManage={canManage} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function FeedbackRow({ item, canManage }: { item: FeedbackView; canManage: boolean }) {
  const setStatus = useAction(setFeedbackStatusAction, { success: 'Estado actualizado' });

  return (
    <li>
      <Card className="space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{item.categoryLabel}</Badge>
          <Badge tone={STATUS_TONE[item.status]}>{item.statusLabel}</Badge>
          <span className="text-xs text-fg-muted">
            {item.authorName} · {formatRelative(item.createdAt)}
          </span>
        </div>
        <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{item.message}</p>
        {item.updatedByName && item.updatedAt ? (
          <p className="text-xs text-fg-subtle">
            Estado actualizado por {item.updatedByName} · {formatRelative(item.updatedAt)}
          </p>
        ) : null}
        {canManage ? (
          <div className="space-y-1">
            <Select
              aria-label="Cambiar el estado del feedback"
              className="sm:w-48"
              value={item.status}
              disabled={setStatus.isPending}
              onChange={(event) => setStatus.run({ feedbackId: item.id, status: event.target.value })}
            >
              {FEEDBACK_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {FEEDBACK_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
            <ActionError message={setStatus.error} />
          </div>
        ) : null}
      </Card>
    </li>
  );
}
