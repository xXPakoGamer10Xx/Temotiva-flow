import { getSessionContext } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { getAttachmentStorage } from '@/server/storage/attachments';

export const dynamic = 'force-dynamic';

/**
 * Descarga de un documento. El almacén es privado: no hay URL pública, el
 * archivo solo sale por aquí y solo con sesión válida (lista de acceso).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) return new Response('No autenticado', { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('No encontrado', { status: 404 });

  const attachment = await getDataStore().attachmentById(id);
  if (!attachment || attachment.isRemoved) return new Response('No encontrado', { status: 404 });

  const bytes = await getAttachmentStorage().get(attachment.storageKey);
  if (!bytes) return new Response('No encontrado', { status: 404 });

  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': attachment.contentType,
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
