import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { getAttachmentStorage, isAttachmentStorageConfigured } from '@/server/storage/attachments';
import { DomainError } from '@/server/services/errors';
import { MAX_ATTACHMENT_BYTES, addAttachment } from '@/server/services/attachments';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

/**
 * Subida de un documento (PDF o DOCX) a una iniciativa. Es un Route Handler y
 * no una Server Action porque las acciones limitan el cuerpo a 1 MB.
 * La sesión se valida aquí; el tipo, por los bytes del archivo en el servicio.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ ok: false, message: 'Tu sesión ha caducado. Vuelve a entrar.' }, { status: 401 });

  if (!isAttachmentStorageConfigured()) {
    console.error('[temotiva-flow] BLOB_READ_WRITE_TOKEN no está definido: los documentos no se pueden guardar.');
    return NextResponse.json({ ok: false, message: 'Los documentos aún no están disponibles. Avisa a Dirección.' }, { status: 503 });
  }

  const { id } = await params;
  if (!/^TEMO-\d+$/.test(id)) return NextResponse.json({ ok: false, message: 'Iniciativa no válida.' }, { status: 400 });

  // Corta antes de leer el cuerpo si el tamaño declarado ya excede el límite.
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_ATTACHMENT_BYTES + 64 * 1024) {
    return NextResponse.json({ ok: false, message: 'El archivo supera 4 MB.' }, { status: 413 });
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get('file');
  } catch {
    return NextResponse.json({ ok: false, message: 'No se pudo leer el archivo.' }, { status: 400 });
  }
  if (!(file instanceof File)) return NextResponse.json({ ok: false, message: 'Selecciona un archivo.' }, { status: 400 });

  try {
    const storage = getAttachmentStorage();
    const attachment = await addAttachment(getDataStore(), session, storage.put.bind(storage), {
      initiativeId: id,
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    revalidatePath('/', 'layout');
    return NextResponse.json({ ok: true, data: { id: attachment.id } });
  } catch (error) {
    if (error instanceof DomainError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 400;
      return NextResponse.json({ ok: false, message: error.message }, { status });
    }
    console.error('[temotiva-flow] error al subir un documento:', error);
    return NextResponse.json({ ok: false, message: 'No se pudo subir el documento. Inténtalo de nuevo.' }, { status: 500 });
  }
}
