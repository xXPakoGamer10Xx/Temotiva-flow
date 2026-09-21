import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SeedData } from '@/domain/seed';
import type { InMemoryDataStore } from './in-memory';

/**
 * Persistencia de conveniencia para el entorno de trabajo: vuelca el estado
 * del store en memoria a un JSON del lado servidor para que las demos y el
 * hot-reload no pierdan lo que se acaba de hacer.
 *
 * No es la base de datos del sistema ni pretende serlo: la capa real llega con
 * `PostgresDataStore` (DESIGN.md §10.3). Se desactiva con `DATA_SNAPSHOT=false`.
 * El directorio `.data/` está en `.gitignore`.
 */

const SCHEMA_VERSION = 1;
const SNAPSHOT_PATH = join(process.cwd(), '.data', 'store.json');
const WRITE_DEBOUNCE_MS = 200;

interface SnapshotFile {
  schemaVersion: number;
  savedAt: string;
  data: SeedData;
}

export function snapshotEnabled(): boolean {
  return process.env.DATA_SNAPSHOT !== 'false';
}

export function readSnapshot(): SeedData | null {
  if (!snapshotEnabled() || !existsSync(SNAPSHOT_PATH)) return null;
  try {
    const parsed = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as SnapshotFile;
    if (parsed.schemaVersion !== SCHEMA_VERSION || !parsed.data) return null;
    return parsed.data;
  } catch {
    // Un snapshot corrupto nunca debe tumbar el arranque: se ignora y se resiembra.
    return null;
  }
}

/**
 * Conecta el store con el disco: cada mutación agenda un volcado diferido para
 * no escribir una vez por fila tocada dentro de la misma acción.
 */
export function attachSnapshot(store: InMemoryDataStore): void {
  if (!snapshotEnabled()) return;

  let pending: NodeJS.Timeout | null = null;

  const write = (): void => {
    pending = null;
    const payload: SnapshotFile = {
      schemaVersion: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      data: store.snapshot(),
    };
    try {
      mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
      writeFileSync(SNAPSHOT_PATH, JSON.stringify(payload, null, 2), 'utf8');
    } catch (error) {
      console.error('[temotiva-flow] no se pudo guardar el snapshot del store:', error);
    }
  };

  store.setChangeListener(() => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(write, WRITE_DEBOUNCE_MS);
    pending.unref?.();
  });

  if (!existsSync(SNAPSHOT_PATH)) write();
}
