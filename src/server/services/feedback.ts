import { randomUUID } from 'node:crypto';
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES } from '@/domain/enums';
import type { FeedbackCategory, FeedbackStatus } from '@/domain/enums';
import { FEEDBACK_CATEGORY_LABELS, FEEDBACK_STATUS_LABELS } from '@/domain/labels';
import { MAX_FEEDBACK_MESSAGE, MIN_FEEDBACK_MESSAGE } from '@/domain/rules';
import type { FeedbackItem, SessionContext } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { invalid, notFound } from './errors';
import { assertPermission, canManageFeedback } from './rbac';

/**
 * Feedback del equipo sobre la app, la web o la plataforma.
 *
 * Cualquier persona con sesión lo envía; solo los responsables de área y
 * Dirección cambian su estado. Los eventos van a la caja negra sin iniciativa
 * (son del sistema, no de una iniciativa concreta).
 */

export interface CreateFeedbackInput {
  category: FeedbackCategory;
  message: string;
  now?: Date;
}

export async function createFeedback(
  store: DataStore,
  session: SessionContext,
  input: CreateFeedbackInput,
): Promise<FeedbackItem> {
  const now = input.now ?? new Date();
  if (!FEEDBACK_CATEGORIES.includes(input.category)) throw invalid('Elige si el feedback es de la app, la web o la plataforma.');
  const message = input.message.trim();
  if (message.length < MIN_FEEDBACK_MESSAGE) {
    throw invalid(`Cuéntanos un poco más (mínimo ${MIN_FEEDBACK_MESSAGE} caracteres).`);
  }
  if (message.length > MAX_FEEDBACK_MESSAGE) throw invalid(`El feedback no puede superar ${MAX_FEEDBACK_MESSAGE} caracteres.`);

  const item = await store.insertFeedback({
    id: randomUUID(),
    category: input.category,
    message,
    status: 'PENDING',
    createdBy: session.userId,
    createdAt: now.toISOString(),
    updatedBy: null,
    updatedAt: null,
  });

  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'FEEDBACK_CREATED',
    fieldName: 'feedback',
    newValue: { id: item.id, category: item.category },
    at: now,
  });
  return item;
}

export async function setFeedbackStatus(
  store: DataStore,
  session: SessionContext,
  input: { feedbackId: string; status: FeedbackStatus; now?: Date },
): Promise<FeedbackItem> {
  const now = input.now ?? new Date();
  assertPermission(
    canManageFeedback(session),
    'Solo los responsables de área y Dirección pueden cambiar el estado del feedback.',
  );
  if (!FEEDBACK_STATUSES.includes(input.status)) throw invalid('El estado indicado no es válido.');

  const current = await store.feedbackById(input.feedbackId);
  if (!current) throw notFound('El feedback indicado no existe.');
  if (current.status === input.status) return current;

  const updated = await store.updateFeedbackStatus(current.id, input.status, session.userId, now.toISOString());
  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'FEEDBACK_STATUS_CHANGED',
    fieldName: 'feedback',
    oldValue: { id: current.id, status: current.status },
    newValue: { id: current.id, status: input.status },
    at: now,
  });
  return updated;
}

export interface FeedbackView {
  id: string;
  category: FeedbackCategory;
  categoryLabel: string;
  message: string;
  status: FeedbackStatus;
  statusLabel: string;
  authorName: string;
  createdAt: string;
  updatedByName: string | null;
  updatedAt: string | null;
}

/** Proyección de solo lectura para la pestaña Feedback, la más reciente primero. */
export async function getFeedbackView(store: DataStore): Promise<FeedbackView[]> {
  const [items, users] = await Promise.all([store.listFeedback(), store.listUsers()]);
  const names = new Map(users.map((user) => [user.id, user.name]));
  return items.map((item) => ({
    id: item.id,
    category: item.category,
    categoryLabel: FEEDBACK_CATEGORY_LABELS[item.category],
    message: item.message,
    status: item.status,
    statusLabel: FEEDBACK_STATUS_LABELS[item.status],
    authorName: names.get(item.createdBy) ?? '—',
    createdAt: item.createdAt,
    updatedByName: item.updatedBy ? (names.get(item.updatedBy) ?? '—') : null,
    updatedAt: item.updatedAt,
  }));
}
