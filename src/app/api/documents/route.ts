import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { DEPARTMENTS } from '@/domain/enums';
import type { Department } from '@/domain/enums';
import { MAX_DOCUMENT_BYTES } from '@/domain/document-files';
import { getSessionContext } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { getAttachmentStorage, isAttachmentStorageConfigured } from '@/server/storage/attachments';
import { uploadDocument } from '@/server/services/documents';
import { DomainError } from '@/server/services/errors';

export const dynamic = 'force-dynamic';

/**
 * Subida a la biblioteca de documentos. Es un Route Handler y no una Server
 * Action porque las acciones limitan el cuerpo a 1 MB. La sesión se valida aquí;
 * el área y el tipo de archivo, en el servicio.
 */
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ ok: false, message: 'Tu sesión ha caducado. Vuelve a entrar.' }, { status: 401 });

  if (!isAttachmentStorageConfigured()) {
    console.error('[temotiva-flow] BLOB_READ_WRITE_TOKEN no está definido: los documentos no se pueden guardar.');
    return NextResponse.json({ ok: false, message: 'Los documentos aún no están disponibles. Avisa a Dirección.' }, { status: 503 });
  }

  // Corta antes de leer el cuerpo si el tamaño declarado ya excede el límite.
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_DOCUMENT_BYTES + 64 * 1024) {
    return NextResponse.json({ ok: false, message: 'El archivo supera 4 MB.' }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, message: 'No se pudo leer el archivo.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ ok: false, message: 'Selecciona un archivo.' }, { status: 400 });

  const rawDepartment = form.get('department');
  const department =
    typeof rawDepartment === 'string' && (DEPARTMENTS as readonly string[]).includes(rawDepartment)
      ? (rawDepartment as Department)
      : undefined;
  const rawDescription = form.get('description');

  try {
    const storage = getAttachmentStorage();
    const document = await uploadDocument(getDataStore(), session, storage.put.bind(storage), {
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      description: typeof rawDescription === 'string' ? rawDescription : '',
      department,
    });
    revalidatePath('/', 'layout');
    return NextResponse.json({ ok: true, data: { id: document.id } });
  } catch (error) {
    if (error instanceof DomainError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 400;
      return NextResponse.json({ ok: false, message: error.message }, { status });
    }
    console.error('[temotiva-flow] error al subir un documento de la biblioteca:', error);
    return NextResponse.json({ ok: false, message: 'No se pudo subir el documento. Inténtalo de nuevo.' }, { status: 500 });
  }
}
