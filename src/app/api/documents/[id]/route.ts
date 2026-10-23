import { getSessionContext } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { getAttachmentStorage } from '@/server/storage/attachments';
import { loadViewableDocument } from '@/server/services/documents';
import { DomainError } from '@/server/services/errors';

export const dynamic = 'force-dynamic';

/**
 * Descarga de un documento de la biblioteca. El almacén es privado: el archivo
 * solo sale por aquí, con sesión válida y solo si esa persona puede verlo. Sin
 * acceso se responde 404 para no revelar que el documento existe.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) return new Response('No autenticado', { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('No encontrado', { status: 404 });

  try {
    const document = await loadViewableDocument(getDataStore(), session, id);
    const bytes = await getAttachmentStorage().get(document.storageKey);
    if (!bytes) return new Response('No encontrado', { status: 404 });

    return new Response(Buffer.from(bytes), {
      headers: {
        'Content-Type': document.contentType,
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof DomainError) return new Response('No encontrado', { status: 404 });
    throw error;
  }
}
