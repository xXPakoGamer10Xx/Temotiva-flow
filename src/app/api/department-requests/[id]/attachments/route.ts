import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSessionContext } from '@/lib/session';
import { MAX_REQUEST_FILE_BYTES } from '@/domain/rules';
import { getDataStore } from '@/server/repositories';
import { getAttachmentStorage, isAttachmentStorageConfigured } from '@/server/storage/attachments';
import { attachmentSideSchema } from '@/server/actions/department-requests-schemas';
import { DomainError } from '@/server/services/errors';
import { addDepartmentRequestFile } from '@/server/services/department-requests';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Subida de un archivo a una petición entre áreas (spec 001, ampliación A).
 * Route Handler y no Server Action porque las acciones limitan el cuerpo a 1 MB.
 * Aquí solo se valida la sesión y la forma; el servicio decide el lado, el
 * Need-to-Know, el tipo real por los bytes, el tamaño y el cupo.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ ok: false, message: 'Tu sesión ha caducado. Vuelve a entrar.' }, { status: 401 });

  if (!isAttachmentStorageConfigured()) {
    console.error('[temotiva-flow] BLOB_READ_WRITE_TOKEN no está definido: los archivos no se pueden guardar.');
    return NextResponse.json({ ok: false, message: 'Los archivos aún no están disponibles. Avisa a Dirección.' }, { status: 503 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, message: 'La petición no existe.' }, { status: 404 });

  // Corta antes de leer el cuerpo si el tamaño declarado ya excede el límite.
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_REQUEST_FILE_BYTES + 64 * 1024) {
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
  const side = attachmentSideSchema.safeParse(form.get('side'));
  if (!side.success) {
    return NextResponse.json({ ok: false, message: side.error.issues[0]?.message ?? 'Lado no válido.' }, { status: 400 });
  }

  try {
    const storage = getAttachmentStorage();
    const item = await addDepartmentRequestFile(getDataStore(), session, storage.put.bind(storage), {
      requestId: id,
      side: side.data,
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    revalidatePath('/dependencias');
    return NextResponse.json({ ok: true, data: { id: item.id } });
  } catch (error) {
    if (error instanceof DomainError) {
      const status =
        error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : error.code === 'INVALID_STATE' ? 409 : 400;
      return NextResponse.json({ ok: false, message: error.message }, { status });
    }
    // Nunca se filtra la traza interna a la interfaz (SEGURIDAD.md §8.5).
    console.error('[temotiva-flow] error al subir un archivo a una petición:', error);
    return NextResponse.json({ ok: false, message: 'No se pudo subir el archivo. Inténtalo de nuevo.' }, { status: 500 });
  }
}
