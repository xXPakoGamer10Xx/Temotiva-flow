import 'server-only';
import { buildSeedData } from '@/domain/seed';
import { InMemoryDataStore } from './in-memory';
import { PostgresDataStore } from './postgres';
import { attachSnapshot, readSnapshot } from './snapshot';
import type { DataStore } from './types';

export type { DataStore } from './types';
export { InMemoryDataStore } from './in-memory';
export { PostgresDataStore } from './postgres';

/**
 * Store único por proceso de servidor. Se guarda en `globalThis` para
 * sobrevivir al hot-reload de desarrollo y mantener la conexión activa.
 *
 * Si DATABASE_URL está presente (Vercel / producción), opera contra PostgreSQL.
 * De lo contrario, opera en memoria (tests y demos locales sin base de datos).
 */
const STORE_KEY = Symbol.for('temotiva-flow.datastore');

type GlobalWithStore = typeof globalThis & { [STORE_KEY]?: DataStore };

function getDbUrl(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.STORAGE_URL ||
    process.env.STORAGE_DATABASE_URL
  );
}

function createStore(): DataStore {
  if (getDbUrl()) {
    return new PostgresDataStore();
  }
  const persisted = readSnapshot();
  const store = new InMemoryDataStore(persisted ?? buildSeedData());
  attachSnapshot(store);
  return store;
}

export function getDataStore(): DataStore {
  const globalScope = globalThis as GlobalWithStore;
  globalScope[STORE_KEY] ??= createStore();
  return globalScope[STORE_KEY];
}

