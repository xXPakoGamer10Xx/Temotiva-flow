import { randomUUID } from 'node:crypto';
import type { Attachment, SessionContext } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { loadInitiative } from './blocking';
import { forbidden, invalid, invalidState, notFound } from './errors';
import { canRemoveAttachment } from './rbac';

/**
 * Documentos adjuntos (PDF y DOCX) a una iniciativa.
 *
 * Servicio puro: recibe el `DataStore` y un `put` de almacenamiento inyectados.
 * El tipo se decide por los **bytes** del archivo (firma `%PDF-` o ZIP con
 * `word/document.xml`), nunca por el MIME ni la extensión que declare el cliente.
 */

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const PDF_MIME = 'application/pdf';
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const ATTACHMENT_TYPE_ERROR = 'Solo se admiten documentos PDF o Word (.docx).';

/** Devuelve el MIME real si los bytes son un PDF o un DOCX; si no, `null`. */
export function detectDocumentType(bytes: Uint8Array): string | null {
  const startsWith = (...signature: number[]): boolean => signature.every((byte, index) => bytes[index] === byte);
  if (startsWith(0x25, 0x50, 0x44, 0x46, 0x2d)) return PDF_MIME; // %PDF-
  if (startsWith(0x50, 0x4b, 0x03, 0x04)) {
    // Un DOCX es un ZIP cuyo directorio nombra `word/document.xml` sin comprimir.
    const text = Buffer.from(bytes).toString('latin1');
    if (text.includes('word/document.xml') && text.includes('[Content_Types].xml')) return DOCX_MIME;
  }
  return null;
}

/** Nombre apto para mostrar y para cabeceras: sin rutas ni caracteres de control. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>:|?*]/g, '').trim();
  return (cleaned || 'documento').slice(0, 200);
}

export interface AddAttachmentInput {
  initiativeId: string;
  fileName: string;
  bytes: Uint8Array;
  now?: Date;
}

export async function addAttachment(
  store: DataStore,
  session: SessionContext,
  put: (key: string, bytes: Uint8Array, contentType: string) => Promise<void>,
  input: AddAttachmentInput,
): Promise<Attachment> {
  const now = input.now ?? new Date();
  const initiative = await loadInitiative(store, input.initiativeId);
  if (initiative.isArchived) throw invalidState('La iniciativa está archivada.');

  if (input.bytes.byteLength === 0) throw invalid('El archivo está vacío.');
  if (input.bytes.byteLength > MAX_ATTACHMENT_BYTES) throw invalid('El archivo supera 4 MB.');

  const contentType = detectDocumentType(input.bytes);
  if (!contentType) throw invalid(ATTACHMENT_TYPE_ERROR);
  const extension = contentType === PDF_MIME ? 'pdf' : 'docx';

  let fileName = sanitizeFileName(input.fileName);
  // El nombre mostrado conserva la extensión que corresponde al contenido real.
  if (!fileName.toLowerCase().endsWith(`.${extension}`)) fileName = `${fileName}.${extension}`;

  const id = randomUUID();
  const storageKey = `initiatives/${initiative.id}/${id}.${extension}`;
  await put(storageKey, input.bytes, contentType);

  const attachment = await store.insertAttachment({
    id,
    initiativeId: initiative.id,
    fileName,
    contentType,
    sizeBytes: input.bytes.byteLength,
    storageKey,
    uploadedBy: session.userId,
    uploadedAt: now.toISOString(),
    isRemoved: false,
    removedBy: null,
    removedAt: null,
  });

  await audit(store, {
    initiativeId: initiative.id,
    session,
    actionType: 'ATTACHMENT_ADDED',
    fieldName: 'attachments',
    newValue: { attachmentId: id, fileName, sizeBytes: attachment.sizeBytes },
    at: now,
  });
  return attachment;
}

/** Baja lógica: quien lo subió, el LEAD del área propietaria o Dirección. */
export async function removeAttachment(
  store: DataStore,
  session: SessionContext,
  input: { attachmentId: string; now?: Date },
): Promise<Attachment> {
  const now = input.now ?? new Date();
  const attachment = await store.attachmentById(input.attachmentId);
  if (!attachment || attachment.isRemoved) throw notFound('El documento no existe o ya se retiró.');
  const initiative = await loadInitiative(store, attachment.initiativeId);
  if (initiative.isArchived) throw invalidState('La iniciativa está archivada.');
  if (!canRemoveAttachment(session, initiative, attachment)) {
    throw forbidden('Solo quien subió el documento, el responsable del área propietaria o Dirección pueden retirarlo.');
  }

  const updated = await store.markAttachmentRemoved(attachment.id, session.userId, now.toISOString());
  await audit(store, {
    initiativeId: initiative.id,
    session,
    actionType: 'ATTACHMENT_REMOVED',
    fieldName: 'attachments',
    oldValue: { attachmentId: attachment.id, fileName: attachment.fileName },
    at: now,
  });
  return updated;
}
