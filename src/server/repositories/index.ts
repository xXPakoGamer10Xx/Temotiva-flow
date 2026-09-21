import 'server-only';
import { buildSeedData } from '@/domain/seed';
import { InMemoryDataStore } from './in-memory';
import { attachSnapshot, readSnapshot } from './snapshot';
import type { DataStore } from './types';

export type { DataStore } from './types';
export { InMemoryDataStore } from './in-memory';

/**
 * Store único por proceso de servidor. Se guarda en `globalThis` para
 * sobrevivir al hot-reload de desarrollo, que de otro modo crearía un store
 * nuevo (y vacío de cambios) en cada recompilación.
 */
const STORE_KEY = Symbol.for('temotiva-flow.datastore');

type GlobalWithStore = typeof globalThis & { [STORE_KEY]?: InMemoryDataStore };

function createStore(): InMemoryDataStore {
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
