import 'server-only';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

/**
 * Almacenamiento de documentos adjuntos. El dominio solo conoce esta interfaz:
 * en Vercel se usa Blob **privado** (se activa con `BLOB_READ_WRITE_TOKEN`) y en
 * desarrollo, `.data/attachments/`. Los archivos nunca tienen URL pública: se
 * sirven por `/api/attachments/[id]`, que valida la sesión.
 */
export interface AttachmentStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

class VercelBlobStorage implements AttachmentStorage {
  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const { put } = await import('@vercel/blob');
    await put(key, Buffer.from(bytes), { access: 'private', contentType, addRandomSuffix: false });
  }

  async get(key: string): Promise<Uint8Array | null> {
    const { get } = await import('@vercel/blob');
    const result = await get(key, { access: 'private' });
    if (!result || result.statusCode !== 200) return null;
    return new Uint8Array(await new Response(result.stream).arrayBuffer());
  }
}

class LocalDiskStorage implements AttachmentStorage {
  private readonly root = resolve(process.cwd(), '.data', 'attachments');

  /** La clave la genera el servidor, pero se comprueba igualmente que no escapa de la raíz. */
  private pathFor(key: string): string {
    const full = resolve(join(this.root, key));
    if (!full.startsWith(this.root + sep)) throw new Error('Clave de almacenamiento no válida.');
    return full;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.pathFor(key)));
    } catch {
      return null;
    }
  }
}

let storage: AttachmentStorage | null = null;

/** En producción el disco es de solo lectura (Vercel): sin Blob no hay dónde guardar. */
export function isAttachmentStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN) || process.env.NODE_ENV !== 'production';
}

export function getAttachmentStorage(): AttachmentStorage {
  if (!storage) storage = process.env.BLOB_READ_WRITE_TOKEN ? new VercelBlobStorage() : new LocalDiskStorage();
  return storage;
}
