import { getSessionContext } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { getAttachmentStorage } from '@/server/storage/attachments';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Imagen de un feedback. El almacén es privado: no hay URL pública, la imagen
 * solo sale por aquí y solo con sesión válida (lista de acceso).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  const session = await getSessionContext();
  if (!session) return new Response('No autenticado', { status: 401 });

  const { id, imageId } = await params;
  if (!UUID.test(id) || !UUID.test(imageId)) return new Response('No encontrado', { status: 404 });

  const item = await getDataStore().feedbackById(id);
  const image = item?.images?.find((candidate) => candidate.id === imageId);
  if (!image) return new Response('No encontrado', { status: 404 });

  const bytes = await getAttachmentStorage().get(image.storageKey);
  if (!bytes) return new Response('No encontrado', { status: 404 });

  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': image.contentType,
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(image.fileName)}`,
      'X-Content-Type-Options': 'nosniff',
      // Defensa extra: aunque algo no fuera una imagen, el navegador no ejecuta nada.
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      'Cache-Control': 'private, no-store',
    },
  });
}
