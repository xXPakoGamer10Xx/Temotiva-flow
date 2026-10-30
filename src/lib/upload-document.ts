import { isUploadOk, uploadErrorMessage } from '@/lib/upload-response';
import { checkDocumentFile } from '@/domain/document-files';
import type { Department } from '@/domain/enums';

/** Sube un documento a la biblioteca. Devuelve `null` si fue bien o el mensaje de error. */
export async function uploadLibraryDocument(input: {
  file: File;
  department: Department;
  description: string;
}): Promise<string | null> {
  const invalid = checkDocumentFile(input.file);
  if (invalid) return invalid;
  try {
    const body = new FormData();
    body.set('file', input.file);
    body.set('department', input.department);
    body.set('description', input.description);
    const response = await fetch('/api/documents', { method: 'POST', body });
    if (!(await isUploadOk(response))) return uploadErrorMessage(response, 'No se pudo subir el documento.');
    return null;
  } catch {
    return 'No se pudo subir el documento. Comprueba la conexión.';
  }
}
