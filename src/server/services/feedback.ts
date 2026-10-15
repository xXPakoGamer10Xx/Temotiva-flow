import { randomUUID } from 'node:crypto';
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES } from '@/domain/enums';
import type { FeedbackCategory, FeedbackStatus } from '@/domain/enums';
import { DEPARTMENT_LABELS, FEEDBACK_CATEGORY_LABELS, FEEDBACK_STATUS_LABELS } from '@/domain/labels';
import {
  MAX_FEEDBACK_IMAGES,
  MAX_FEEDBACK_IMAGE_BYTES,
  MAX_FEEDBACK_MESSAGE,
  MIN_FEEDBACK_MESSAGE,
} from '@/domain/rules';
import type { FeedbackImage, FeedbackItem, SessionContext } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { forbidden, invalid, notFound } from './errors';
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
    images: [],
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

export const FEEDBACK_IMAGE_TYPE_ERROR = 'Solo se admiten imágenes PNG, JPG, WebP o GIF.';

const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' } as const;

/**
 * Tipo real de la imagen por sus bytes (nunca por la extensión ni el MIME que
 * declare el cliente). SVG queda fuera a propósito: puede llevar scripts.
 */
export function detectImageType(bytes: Uint8Array): { extension: keyof typeof IMAGE_TYPES; contentType: string } | null {
  const at = (offset: number, ...signature: number[]): boolean =>
    signature.every((byte, index) => bytes[offset + index] === byte);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { extension: 'png', contentType: IMAGE_TYPES.png };
  if (at(0, 0xff, 0xd8, 0xff)) return { extension: 'jpg', contentType: IMAGE_TYPES.jpg };
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return { extension: 'gif', contentType: IMAGE_TYPES.gif }; // GIF8
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { extension: 'webp', contentType: IMAGE_TYPES.webp }; // RIFF....WEBP
  return null;
}

/** Nombre apto para mostrar: sin rutas ni caracteres de control. */
function safeImageName(name: string, extension: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f"<>:|?*]/g, '').trim();
  const stem = (base || 'imagen').slice(0, 120);
  return /\.(png|jpe?g|webp|gif)$/i.test(stem) ? stem : `${stem}.${extension}`;
}

/** Adjunta una imagen a un feedback. Solo quien lo envió, y hasta MAX_FEEDBACK_IMAGES. */
export async function addFeedbackImage(
  store: DataStore,
  session: SessionContext,
  put: (key: string, bytes: Uint8Array, contentType: string) => Promise<void>,
  input: { feedbackId: string; fileName: string; bytes: Uint8Array; now?: Date },
): Promise<FeedbackImage> {
  const item = await store.feedbackById(input.feedbackId);
  if (!item) throw notFound('El feedback indicado no existe.');
  if (item.createdBy !== session.userId) throw forbidden('Solo quien envió el feedback puede añadirle imágenes.');
  if ((item.images ?? []).length >= MAX_FEEDBACK_IMAGES) throw invalid(`Máximo ${MAX_FEEDBACK_IMAGES} imágenes por feedback.`);

  if (input.bytes.byteLength === 0) throw invalid('La imagen está vacía.');
  if (input.bytes.byteLength > MAX_FEEDBACK_IMAGE_BYTES) throw invalid('La imagen supera 4 MB.');
  const type = detectImageType(input.bytes);
  if (!type) throw invalid(FEEDBACK_IMAGE_TYPE_ERROR);

  const id = randomUUID();
  const storageKey = `feedback/${item.id}/${id}.${type.extension}`;
  await put(storageKey, input.bytes, type.contentType);

  const image: FeedbackImage = {
    id,
    fileName: safeImageName(input.fileName, type.extension),
    contentType: type.contentType,
    sizeBytes: input.bytes.byteLength,
    storageKey,
    uploadedAt: (input.now ?? new Date()).toISOString(),
  };
  await store.appendFeedbackImage(item.id, image);
  return image;
}

export interface FeedbackView {
  id: string;
  category: FeedbackCategory;
  categoryLabel: string;
  message: string;
  status: FeedbackStatus;
  statusLabel: string;
  authorName: string;
  /** Áreas a las que pertenece quien envió el feedback (etiquetas). */
  authorAreas: string[];
  images: { id: string; fileName: string }[];
  createdAt: string;
  updatedByName: string | null;
  updatedAt: string | null;
}

/** Proyección de solo lectura para la pestaña Feedback, la más reciente primero. */
export async function getFeedbackView(store: DataStore): Promise<FeedbackView[]> {
  const [items, users] = await Promise.all([store.listFeedback(), store.listUsers()]);
  const names = new Map(users.map((user) => [user.id, user.name]));
  const areas = new Map(users.map((user) => [user.id, user.departments.map((department) => DEPARTMENT_LABELS[department])]));
  return items.map((item) => ({
    id: item.id,
    category: item.category,
    categoryLabel: FEEDBACK_CATEGORY_LABELS[item.category],
    message: item.message,
    status: item.status,
    statusLabel: FEEDBACK_STATUS_LABELS[item.status],
    authorName: names.get(item.createdBy) ?? '—',
    authorAreas: areas.get(item.createdBy) ?? [],
    images: (item.images ?? []).map((image) => ({ id: image.id, fileName: image.fileName })),
    createdAt: item.createdAt,
    updatedByName: item.updatedBy ? (names.get(item.updatedBy) ?? '—') : null,
    updatedAt: item.updatedAt,
  }));
}
