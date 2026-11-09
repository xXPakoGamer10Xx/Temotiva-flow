import { getSessionContext } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { getAttachmentStorage } from '@/server/storage/attachments';
import { DomainError } from '@/server/services/errors';
import { getDepartmentRequestFile } from '@/server/services/department-requests';

export const dynamic = 'force-dynamic';

/**
 * Descarga de un archivo de una petición entre áreas (spec 001, RF-21).
 *
 * A diferencia de `/api/attachments/[id]` (iniciativas, visibles para todos),
 * aquí se aplica el Need-to-Know: solo lo descarga quien puede ver la petición.
 * Para cualquier otra persona el archivo «no existe», igual que un id inventado.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) return new Response('No autenticado', { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('No encontrado', { status: 404 });

  try {
    const item = await getDepartmentRequestFile(getDataStore(), session, id);
    const bytes = await getAttachmentStorage().get(item.storageKey);
    if (!bytes) return new Response('No encontrado', { status: 404 });

    return new Response(Buffer.from(bytes), {
      headers: {
        'Content-Type': item.contentType,
        'Content-Length': String(bytes.byteLength),
        // Siempre como descarga, también las imágenes: nada se interpreta en el origen de la app.
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(item.fileName)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof DomainError) return new Response('No encontrado', { status: 404 });
    console.error('[temotiva-flow] error al descargar un archivo de una petición:', error);
    return new Response('Error', { status: 500 });
  }
}
