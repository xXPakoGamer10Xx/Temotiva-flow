import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActivityLogEntry } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { emitAuditAppended, onAuditAppended } from './audit-listeners';
import { TEST_NOW, makeSession, makeTestStore } from './test-utils';

/** Registro de oyentes de la caja negra (spec 002, T-03). */

const cleanups: (() => void)[] = [];
function listen(listener: (store: DataStore, entry: ActivityLogEntry) => unknown): void {
  cleanups.push(onAuditAppended(listener as (store: DataStore, entry: ActivityLogEntry) => void));
}

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function auditSample(store: DataStore) {
  return audit(store, {
    initiativeId: 'TEMO-500',
    session: makeSession('LEGAL', 'LEAD'),
    actionType: 'INITIATIVE_UPDATED',
    fieldName: 'title',
    oldValue: 'Antes',
    newValue: 'Después',
    at: TEST_NOW,
  });
}

describe('oyentes de la caja negra', () => {
  it('sin oyentes, audit() guarda y devuelve la entrada como siempre', async () => {
    const { store } = makeTestStore();
    const entry = await auditSample(store);

    expect(entry.id).toBeTruthy();
    expect(entry.actionType).toBe('INITIATIVE_UPDATED');
    expect(await store.listActivityLog('TEMO-500')).toEqual([entry]);
  });

  it('cada oyente recibe el store y la entrada ya guardada, con su id', async () => {
    const { store } = makeTestStore();
    const seen: { store: DataStore; entry: ActivityLogEntry }[] = [];
    listen((s, e) => {
      seen.push({ store: s, entry: e });
    });

    const entry = await auditSample(store);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.store).toBe(store);
    expect(seen[0]?.entry).toBe(entry);
    expect((await store.listActivityLog('TEMO-500')).map((e) => e.id)).toContain(seen[0]?.entry.id);
  });

  it('un oyente que lanza no rompe audit() ni impide avisar a los demás', async () => {
    const { store } = makeTestStore();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const second = vi.fn();
    listen(() => {
      throw new Error('fallo del push');
    });
    listen(second);

    await expect(auditSample(store)).resolves.toMatchObject({ actionType: 'INITIATIVE_UPDATED' });
    expect(second).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('un oyente asíncrono que rechaza no deja una promesa sin capturar', async () => {
    const { store } = makeTestStore();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    listen(async () => {
      throw new Error('fallo asíncrono');
    });

    await auditSample(store);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(unhandled).not.toHaveBeenCalled();
    process.off('unhandledRejection', unhandled);
    error.mockRestore();
  });

  it('el error registrado no incluye la entrada ni datos de la persona', async () => {
    const { store } = makeTestStore();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    listen(() => {
      throw new Error('fallo');
    });

    await auditSample(store);

    const logged = JSON.stringify(error.mock.calls);
    expect(logged).not.toContain('Después');
    expect(logged).not.toContain('TEMO-500');
    error.mockRestore();
  });

  it('desregistrar un oyente deja de avisarle', async () => {
    const { store } = makeTestStore();
    const listener = vi.fn();
    const off = onAuditAppended(listener);
    off();

    await auditSample(store);
    expect(listener).not.toHaveBeenCalled();
  });

  it('el registro vive en globalThis: dos copias del módulo comparten oyentes', async () => {
    const listener = vi.fn();
    listen(listener);
    vi.resetModules();
    const fresh = await import('./audit-listeners');
    const { store } = makeTestStore();
    const entry = await auditSample(store);
    listener.mockClear();

    fresh.emitAuditAppended(store, entry);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('emitAuditAppended sin oyentes no hace nada', () => {
    const { store } = makeTestStore();
    expect(() => emitAuditAppended(store, {} as ActivityLogEntry)).not.toThrow();
  });
});
