import { isUploadOk, uploadErrorMessage } from '@/lib/upload-response';
import { MAX_FEEDBACK_IMAGE_BYTES } from '@/domain/rules';

const IMAGE_EXTENSION = /\.(png|jpe?g|webp|gif)$/i;

/** Mensaje de error si el archivo no es admisible a simple vista; el servidor lo revalida por contenido. */
export function checkImage(file: File): string | null {
  const looksLikeImage = file.type.startsWith('image/') || IMAGE_EXTENSION.test(file.name);
  if (!looksLikeImage || file.type === 'image/svg+xml') return 'Solo se admiten imágenes PNG, JPG, WebP o GIF.';
  if (file.size > MAX_FEEDBACK_IMAGE_BYTES) return 'La imagen supera 4 MB.';
  return null;
}

/** Sube una imagen a un feedback. Devuelve `null` si fue bien o el mensaje de error. */
export async function uploadFeedbackImage(feedbackId: string, file: File): Promise<string | null> {
  const invalid = checkImage(file);
  if (invalid) return invalid;
  try {
    const body = new FormData();
    body.set('file', file);
    const response = await fetch(`/api/feedback/${feedbackId}/images`, { method: 'POST', body });
    if (!(await isUploadOk(response))) return uploadErrorMessage(response, 'No se pudo subir la imagen.');
    return null;
  } catch {
    return 'No se pudo subir la imagen. Comprueba la conexión.';
  }
}
