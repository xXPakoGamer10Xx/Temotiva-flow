import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSessionContext } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { getAttachmentStorage, isAttachmentStorageConfigured } from '@/server/storage/attachments';
import { DomainError } from '@/server/services/errors';
import { addFeedbackImage } from '@/server/services/feedback';
import { MAX_FEEDBACK_IMAGE_BYTES } from '@/domain/rules';

export const dynamic = 'force-dynamic';

/**
 * Subida de una imagen a un feedback. Route Handler y no Server Action porque
 * las acciones limitan el cuerpo a 1 MB. La sesión se valida aquí; que sea una
 * imagen real, por los bytes en el servicio.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ ok: false, message: 'Tu sesión ha caducado. Vuelve a entrar.' }, { status: 401 });

  if (!isAttachmentStorageConfigured()) {
    console.error('[temotiva-flow] BLOB_READ_WRITE_TOKEN no está definido: las imágenes no se pueden guardar.');
    return NextResponse.json({ ok: false, message: 'Las imágenes aún no están disponibles. Avisa a Dirección.' }, { status: 503 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, message: 'Feedback no válido.' }, { status: 400 });

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_FEEDBACK_IMAGE_BYTES + 64 * 1024) {
    return NextResponse.json({ ok: false, message: 'La imagen supera 4 MB.' }, { status: 413 });
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get('file');
  } catch {
    return NextResponse.json({ ok: false, message: 'No se pudo leer la imagen.' }, { status: 400 });
  }
  if (!(file instanceof File)) return NextResponse.json({ ok: false, message: 'Selecciona una imagen.' }, { status: 400 });

  try {
    const storage = getAttachmentStorage();
    const image = await addFeedbackImage(getDataStore(), session, storage.put.bind(storage), {
      feedbackId: id,
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    revalidatePath('/feedback');
    return NextResponse.json({ ok: true, data: { id: image.id } });
  } catch (error) {
    if (error instanceof DomainError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 400;
      return NextResponse.json({ ok: false, message: error.message }, { status });
    }
    console.error('[temotiva-flow] error al subir una imagen de feedback:', error);
    return NextResponse.json({ ok: false, message: 'No se pudo subir la imagen. Inténtalo de nuevo.' }, { status: 500 });
  }
}
