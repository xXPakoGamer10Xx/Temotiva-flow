'use client';

import * as React from 'react';
import { ImagePlus, Send, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES } from '@/domain/enums';
import type { FeedbackCategory, FeedbackStatus } from '@/domain/enums';
import { FEEDBACK_CATEGORY_LABELS, FEEDBACK_STATUS_LABELS } from '@/domain/labels';
import { createFeedbackAction, setFeedbackStatusAction } from '@/server/actions/feedback';
import { MAX_FEEDBACK_IMAGES, MAX_FEEDBACK_MESSAGE, MIN_FEEDBACK_MESSAGE } from '@/domain/rules';
import { checkImage, uploadFeedbackImage } from '@/lib/upload-feedback-image';
import { toast } from '@/lib/toast';
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
  const router = useRouter();
  const [images, setImages] = React.useState<File[]>([]);
  const [imageError, setImageError] = React.useState<string | null>(null);

  // Las miniaturas viven en memoria del navegador; se liberan al quitarlas.
  const previews = React.useMemo(() => images.map((file) => URL.createObjectURL(file)), [images]);
  React.useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const addImages = (list: File[]): void => {
    if (list.length === 0) return;
    const problem = list.map(checkImage).find(Boolean) ?? null;
    setImageError(problem);
    if (problem) return;
    if (images.length + list.length > MAX_FEEDBACK_IMAGES) {
      setImageError(`Máximo ${MAX_FEEDBACK_IMAGES} imágenes por feedback.`);
      return;
    }
    setImages((current) => [...current, ...list]);
  };

  const visible = filter === 'ALL' ? items : items.filter((item) => item.status === filter);
  const missing = Math.max(0, MIN_FEEDBACK_MESSAGE - message.trim().length);
  const canSend = missing === 0 && !create.isPending;

  return (
    <>
      <Card className="space-y-3 p-4">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSend) return;
            create.run({ category, message }, (data) => {
              // El feedback ya existe: ahora se suben sus imágenes, una a una.
              const pending = images;
              void (async () => {
                for (const file of pending) {
                  const problem = await uploadFeedbackImage(data.id, file);
                  if (problem) toast(`${file.name}: ${problem}`, 'danger');
                }
                if (pending.length > 0) router.refresh();
              })();
              setMessage('');
              setImages([]);
              setImageError(null);
            });
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
              onPaste={(event) => {
                // Pegar una captura de pantalla (Ctrl/⌘+V) la adjunta directamente.
                const pasted = [...event.clipboardData.files].filter((file) => file.type.startsWith('image/'));
                if (pasted.length > 0) {
                  event.preventDefault();
                  addImages(pasted);
                }
              }}
              placeholder="Qué pasó, qué esperabas o qué te gustaría que hiciera. Sin datos de pacientes."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="feedback-images">Imágenes (opcional)</Label>
            <p className="text-xs text-fg-subtle">
              Capturas o fotos PNG, JPG, WebP o GIF, máx. 4 MB cada una, hasta {MAX_FEEDBACK_IMAGES}. También puedes pegarlas
              con Ctrl/⌘+V en el texto. Sin datos de pacientes.
            </p>
            {images.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {images.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), no hay nada que optimizar */}
                    <img src={previews[index]} alt={`Vista previa de ${file.name}`} className="size-20 rounded-md border border-border object-cover" />
                    <button
                      type="button"
                      onClick={() => setImages((current) => current.filter((_, i) => i !== index))}
                      className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-surface p-0.5 text-fg-subtle hover:text-fg"
                      aria-label={`Quitar ${file.name}`}
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {images.length < MAX_FEEDBACK_IMAGES ? (
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-surface-2">
                <ImagePlus className="size-3.5" aria-hidden />
                Añadir imagen
                <input
                  id="feedback-images"
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  onChange={(event) => {
                    addImages([...(event.target.files ?? [])]);
                    event.target.value = '';
                  }}
                />
              </label>
            ) : null}
            {imageError ? <p role="alert" className="text-xs text-[var(--danger)]">{imageError}</p> : null}
          </div>
          <ActionError message={create.error} />
          {missing > 0 ? (
            <p className="text-xs text-fg-subtle">
              {message.trim().length === 0
                ? `Escribe al menos ${MIN_FEEDBACK_MESSAGE} caracteres para poder enviarlo.`
                : `Faltan ${missing} ${missing === 1 ? 'carácter' : 'caracteres'} para poder enviarlo (mínimo ${MIN_FEEDBACK_MESSAGE}).`}
            </p>
          ) : null}
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
            <span className="font-medium text-fg">{item.authorName}</span>
            {item.authorAreas.length > 0 ? ` · ${item.authorAreas.join(', ')}` : ''} · {formatRelative(item.createdAt)}
          </span>
        </div>
        <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{item.message}</p>
        {item.images.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {item.images.map((image) => (
              <li key={image.id}>
                <a
                  href={`/api/feedback/${item.id}/images/${image.id}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={`Abrir ${image.fileName}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada servida con sesión; next/image no aplica */}
                  <img
                    src={`/api/feedback/${item.id}/images/${image.id}`}
                    alt={image.fileName}
                    loading="lazy"
                    className="size-24 rounded-md border border-border object-cover hover:opacity-90"
                  />
                </a>
              </li>
            ))}
          </ul>
        ) : null}
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
