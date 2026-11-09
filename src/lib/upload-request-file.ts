import type { AttachmentSide } from '@/domain/department-request';
import { MAX_REQUEST_FILE_BYTES } from '@/domain/rules';
import { isUploadOk, uploadErrorMessage } from '@/lib/upload-response';

/**
 * Subida de archivos a una petición entre áreas (spec 001, ampliación A).
 * La comprobación de aquí es solo una ayuda inmediata: el servidor decide por
 * los bytes del archivo, no por su extensión.
 */

export const REQUEST_FILE_ACCEPT = '.pdf,.docx,.png,.jpg,.jpeg,.webp';

/** Mensaje de error si el archivo no es admisible a simple vista; `null` si lo parece. */
export function checkRequestUpload(file: File): string | null {
  if (!/\.(pdf|docx|png|jpe?g|webp)$/i.test(file.name)) return 'Solo se admiten PDF, Word (.docx) o imágenes PNG, JPG y WebP.';
  if (file.size > MAX_REQUEST_FILE_BYTES) return 'El archivo supera 4 MB.';
  return null;
}

/** Sube un archivo al lado indicado. Devuelve `null` si fue bien o el mensaje de error. */
export async function uploadRequestFile(requestId: string, side: AttachmentSide, file: File): Promise<string | null> {
  const invalid = checkRequestUpload(file);
  if (invalid) return invalid;
  try {
    const body = new FormData();
    body.set('file', file);
    body.set('side', side);
    const response = await fetch(`/api/department-requests/${encodeURIComponent(requestId)}/attachments`, {
      method: 'POST',
      body,
    });
    if (!(await isUploadOk(response))) return uploadErrorMessage(response, 'No se pudo subir el archivo.');
    return null;
  } catch {
    return 'No se pudo subir el archivo. Comprueba la conexión.';
  }
}
