import { describe, expect, it } from 'vitest';
import { checklistItemId } from '@/domain/workflow';
import { STAGE_ID_BY_KEY } from '@/domain/workflow';
import { setChecklistItemState } from './checklist';
import { grantAccess, setAccessActive, updateAccess } from './access';
import { TEST_NOW, makeInitiative, makeSession, makeTestStore, makeUser, sessionOf } from './test-utils';

/**
 * Control de acceso verificado en el servidor (SEGURIDAD.md §4): la interfaz
 * puede ocultar botones, pero la frontera real está aquí.
 */
describe('permisos sobre la compuerta', () => {
  it('cada requisito lo marca su departamento responsable', async () => {
    const { store } = makeTestStore();
    // El primer requisito de Viabilidad es el dictamen RGPD, de Legal.
    const item = checklistItemId('FEASIBILITY', 1);

    await expect(
      setChecklistItemState(store, makeSession('DESIGN', 'LEAD'), {
        initiativeId: 'TEMO-500',
        checklistItemId: item,
        isCompleted: true,
        now: TEST_NOW,
      }),
    ).rejects.toThrow(/Legal/i);

    const value = await setChecklistItemState(store, makeSession('LEGAL', 'MEMBER'), {
      initiativeId: 'TEMO-500',
      checklistItemId: item,
      isCompleted: true,
      now: TEST_NOW,
    });
    expect(value.isCompleted).toBe(true);
    expect(value.completedAt).toBe(TEST_NOW.toISOString());
  });

  it('Dirección puede marcar cualquier requisito', async () => {
    const { store } = makeTestStore();

    const value = await setChecklistItemState(store, makeSession('DESIGN', 'EXECUTIVE'), {
      initiativeId: 'TEMO-500',
      checklistItemId: checklistItemId('FEASIBILITY', 1),
      isCompleted: true,
      now: TEST_NOW,
    });

    expect(value.isCompleted).toBe(true);
  });

  it('no se pueden marcar requisitos de otra fase', async () => {
    const { store } = makeTestStore([makeInitiative({ currentStageId: STAGE_ID_BY_KEY.FEASIBILITY })]);

    await expect(
      setChecklistItemState(store, makeSession('DESIGN', 'LEAD'), {
        initiativeId: 'TEMO-500',
        checklistItemId: checklistItemId('CO_DESIGN', 1),
        isCompleted: true,
        now: TEST_NOW,
      }),
    ).rejects.toThrow(/fase actual/i);
  });
});

describe('allowlist de acceso', () => {
  it('solo Dirección puede conceder acceso', async () => {
    const { store } = makeTestStore([]);

    await expect(
      grantAccess(store, makeSession('TECH', 'LEAD'), {
        name: 'Colaboradora Externa',
        email: 'colaboradora@ejemplo.com',
        department: 'DESIGN',
        role: 'MEMBER',
      }),
    ).rejects.toThrow(/Dirección/i);
  });

  it('da de alta normalizando el correo y lo registra como evento de sistema', async () => {
    const { store } = makeTestStore([]);
    const director = makeSession('PRODUCT', 'EXECUTIVE');

    const user = await grantAccess(store, director, {
      name: 'Colaboradora Externa',
      email: '  Colaboradora@Ejemplo.com ',
      department: 'DESIGN',
      role: 'MEMBER',
    });

    expect(user.email).toBe('colaboradora@ejemplo.com');
    expect(await store.userByEmail('COLABORADORA@ejemplo.com')).not.toBeNull();

    const log = await store.listActivityLog();
    expect(log[0]?.actionType).toBe('ACCESS_GRANTED');
    expect(log[0]?.initiativeId).toBeNull();
  });

  it('rechaza correos con formato inválido', async () => {
    const { store } = makeTestStore([]);

    await expect(
      grantAccess(store, makeSession('PRODUCT', 'EXECUTIVE'), {
        name: 'Nombre Válido',
        email: 'esto-no-es-un-correo',
        department: 'TECH',
        role: 'MEMBER',
      }),
    ).rejects.toThrow(/correo/i);
  });

  it('reactiva a quien vuelve en lugar de duplicarlo', async () => {
    const existing = makeUser({ email: 'vuelve@ejemplo.com', isActive: false, department: 'QA' });
    const { store } = makeTestStore([], [existing]);
    const director = makeSession('PRODUCT', 'EXECUTIVE');

    const user = await grantAccess(store, director, {
      name: existing.name,
      email: 'vuelve@ejemplo.com',
      department: 'TECH',
      role: 'LEAD',
    });

    expect(user.id).toBe(existing.id);
    expect(user.isActive).toBe(true);
    expect(user.department).toBe('TECH');
    expect(await store.listUsers()).toHaveLength(1);
  });

  it('revocar el acceso deja el perfil inactivo y auditado', async () => {
    const collaborator = makeUser({ department: 'DESIGN' });
    const director = makeUser({ department: 'PRODUCT', role: 'EXECUTIVE' });
    const { store } = makeTestStore([], [collaborator, director]);

    const updated = await setAccessActive(store, sessionOf(director), {
      userId: collaborator.id,
      isActive: false,
    });

    expect(updated.isActive).toBe(false);
    const log = await store.listActivityLog();
    expect(log.some((entry) => entry.actionType === 'ACCESS_REVOKED')).toBe(true);
  });

  it('nadie puede revocarse el acceso a sí mismo', async () => {
    const director = makeUser({ department: 'PRODUCT', role: 'EXECUTIVE' });
    const { store } = makeTestStore([], [director]);

    await expect(
      setAccessActive(store, sessionOf(director), { userId: director.id, isActive: false }),
    ).rejects.toThrow(/tu propio acceso/i);
  });

  it('cambiar rol o departamento es capacidad exclusiva de Dirección', async () => {
    const collaborator = makeUser({ department: 'DESIGN' });
    const { store } = makeTestStore([], [collaborator]);

    await expect(
      updateAccess(store, makeSession('DESIGN', 'LEAD'), { userId: collaborator.id, role: 'EXECUTIVE' }),
    ).rejects.toThrow(/Dirección/i);
  });
});
