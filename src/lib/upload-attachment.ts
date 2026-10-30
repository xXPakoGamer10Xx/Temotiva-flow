import { isUploadOk, uploadErrorMessage } from '@/lib/upload-response';
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Mensaje de error si el archivo no es admisible a simple vista; el servidor lo revalida por contenido. */
export function checkUpload(file: File): string | null {
  if (!/\.(pdf|docx)$/i.test(file.name)) return 'Solo se admiten documentos PDF o Word (.docx).';
  if (file.size > MAX_UPLOAD_BYTES) return 'El archivo supera 4 MB.';
  return null;
}

/** Sube un documento a una iniciativa. Devuelve `null` si fue bien o el mensaje de error. */
export async function uploadAttachment(initiativeId: string, file: File): Promise<string | null> {
  const invalid = checkUpload(file);
  if (invalid) return invalid;
  try {
    const body = new FormData();
    body.set('file', file);
    const response = await fetch(`/api/initiatives/${initiativeId}/attachments`, { method: 'POST', body });
    if (!(await isUploadOk(response))) return uploadErrorMessage(response, 'No se pudo subir el documento.');
    return null;
  } catch {
    return 'No se pudo subir el documento. Comprueba la conexión.';
  }
}
