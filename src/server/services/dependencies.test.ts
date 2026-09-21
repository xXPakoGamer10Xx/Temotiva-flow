import { describe, expect, it } from 'vitest';
import { createDependency, rejectDependency, resolveDependency } from './dependencies';
import { clearBlocked, setBlocked } from './blocking';
import { TEST_NOW, makeInitiative, makeSession, makeTestStore } from './test-utils';

/**
 * Invariantes 3 y 4 (AGENTS.md §5): no-ping-pong, bloqueo automático de las
 * dependencias bloqueantes y desbloqueo automático al cerrarse la última.
 */
describe('dependencias y estado de parada', () => {
  it('abrir una dependencia no transfiere la propiedad', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);
    const session = makeSession('LEGAL', 'MEMBER');

    await createDependency(store, session, {
      initiativeId: 'TEMO-500',
      targetDepartment: 'TECH',
      helpType: 'INFORMATION',
      description: 'Necesitamos el inventario de tablas con datos personales.',
      isBlocking: false,
      now: TEST_NOW,
    });

    const initiative = await store.initiativeById('TEMO-500');
    expect(initiative?.ownerDepartment).toBe('LEGAL');
    expect(initiative?.isBlocked).toBe(false);
  });

  it('una dependencia bloqueante pone la iniciativa en parada con su causa', async () => {
    const { store } = makeTestStore();
    const session = makeSession('LEGAL', 'MEMBER');

    await createDependency(store, session, {
      initiativeId: 'TEMO-500',
      targetDepartment: 'PRODUCT',
      helpType: 'DECISION',
      description: '¿El protocolo entra en el plan gratuito o solo en el B2B?',
      isBlocking: true,
      now: TEST_NOW,
    });

    const initiative = await store.initiativeById('TEMO-500');
    expect(initiative?.isBlocked).toBe(true);
    expect(initiative?.stopReason).toBe('ESPERANDO_DECISION');
    expect(initiative?.blockedSince).toBe(TEST_NOW.toISOString());

    const log = await store.listActivityLog('TEMO-500');
    expect(log.map((entry) => entry.actionType)).toEqual(['DEPENDENCY_CREATED', 'BLOCKED_SET']);
  });

  it('resolver la última dependencia bloqueante levanta la parada automáticamente', async () => {
    const { store } = makeTestStore();
    const owner = makeSession('LEGAL', 'MEMBER');
    const product = makeSession('PRODUCT', 'LEAD');

    const first = await createDependency(store, owner, {
      initiativeId: 'TEMO-500',
      targetDepartment: 'PRODUCT',
      helpType: 'DECISION',
      description: 'Decisión de alcance del plan gratuito.',
      isBlocking: true,
      now: TEST_NOW,
    });
    const second = await createDependency(store, owner, {
      initiativeId: 'TEMO-500',
      targetDepartment: 'TECH',
      helpType: 'RESOURCE',
      description: 'Acceso al entorno de staging con Redis dedicado.',
      isBlocking: true,
      now: TEST_NOW,
    });

    await resolveDependency(store, product, {
      dependencyId: first.dependency.id,
      resolutionNotes: 'Entra solo en el plan B2B.',
      now: TEST_NOW,
    });

    // Sigue parada: queda otra bloqueante pendiente.
    expect((await store.initiativeById('TEMO-500'))?.isBlocked).toBe(true);

    await resolveDependency(store, makeSession('TECH', 'MEMBER'), {
      dependencyId: second.dependency.id,
      resolutionNotes: 'Entorno provisionado.',
      now: new Date(TEST_NOW.getTime() + 2 * 60 * 60 * 1000),
    });

    const initiative = await store.initiativeById('TEMO-500');
    expect(initiative?.isBlocked).toBe(false);
    expect(initiative?.stopReason).toBeNull();
    // El tiempo en parada se consolida para descontarlo del SLE.
    expect(initiative?.blockedMsInStage).toBe(2 * 60 * 60 * 1000);

    const log = await store.listActivityLog('TEMO-500');
    const cleared = log.filter((entry) => entry.actionType === 'BLOCKED_CLEARED');
    expect(cleared).toHaveLength(1);
  });

  it('resolver una dependencia no bloqueante no levanta una parada declarada a mano', async () => {
    const { store } = makeTestStore();
    const owner = makeSession('LEGAL', 'MEMBER');

    await setBlocked(store, owner, {
      initiativeId: 'TEMO-500',
      stopReason: 'FALTA_CAPACIDAD',
      description: 'Sin capacidad en el equipo hasta el próximo sprint.',
      now: TEST_NOW,
    });

    const dependency = await createDependency(store, owner, {
      initiativeId: 'TEMO-500',
      targetDepartment: 'QA',
      helpType: 'INFORMATION',
      description: 'Criterios de aceptación de la regresión.',
      isBlocking: false,
      now: TEST_NOW,
    });

    await resolveDependency(store, makeSession('QA', 'LEAD'), {
      dependencyId: dependency.dependency.id,
      resolutionNotes: 'Enviados por Notion.',
      now: TEST_NOW,
    });

    expect((await store.initiativeById('TEMO-500'))?.isBlocked).toBe(true);
  });

  it('rechazar una solicitud también la cierra y desbloquea si era la última bloqueante', async () => {
    const { store } = makeTestStore();
    const owner = makeSession('LEGAL', 'MEMBER');

    const dependency = await createDependency(store, owner, {
      initiativeId: 'TEMO-500',
      targetDepartment: 'CYBER',
      helpType: 'VALIDATION',
      description: 'Revisión de superficie de ataque del nuevo endpoint.',
      isBlocking: true,
      now: TEST_NOW,
    });

    await rejectDependency(store, makeSession('CYBER', 'LEAD'), {
      dependencyId: dependency.dependency.id,
      resolutionNotes: 'No aplica: el endpoint no es público.',
      now: TEST_NOW,
    });

    const stored = await store.dependencyById(dependency.dependency.id);
    expect(stored?.status).toBe('REJECTED');
    expect((await store.initiativeById('TEMO-500'))?.isBlocked).toBe(false);
  });

  it('solo el departamento destinatario, Dirección o quien la abrió pueden cerrarla', async () => {
    const { store } = makeTestStore();
    const owner = makeSession('LEGAL', 'MEMBER');

    const dependency = await createDependency(store, owner, {
      initiativeId: 'TEMO-500',
      targetDepartment: 'PSYCHOLOGY',
      helpType: 'INFORMATION',
      description: 'Microcopy definitivo de la pantalla de bienvenida.',
      isBlocking: false,
      now: TEST_NOW,
    });

    await expect(
      resolveDependency(store, makeSession('DESIGN', 'MEMBER'), {
        dependencyId: dependency.dependency.id,
        resolutionNotes: 'Listo',
        now: TEST_NOW,
      }),
    ).rejects.toThrow(/Psicología|abrió/i);
  });

  it('exige una respuesta escrita al cerrar', async () => {
    const { store } = makeTestStore();
    const owner = makeSession('LEGAL', 'MEMBER');

    const dependency = await createDependency(store, owner, {
      initiativeId: 'TEMO-500',
      targetDepartment: 'TECH',
      helpType: 'INFORMATION',
      description: 'Estimación de coste de inferencia del asistente.',
      isBlocking: false,
      now: TEST_NOW,
    });

    await expect(
      resolveDependency(store, makeSession('TECH', 'LEAD'), {
        dependencyId: dependency.dependency.id,
        resolutionNotes: 'ok',
        now: TEST_NOW,
      }),
    ).rejects.toThrow(/respuesta/i);
  });

  it('la parada manual se puede levantar a mano y consolida el tiempo bloqueado', async () => {
    const { store } = makeTestStore();
    const session = makeSession('LEGAL', 'LEAD');

    await setBlocked(store, session, {
      initiativeId: 'TEMO-500',
      stopReason: 'EXTERNO',
      description: 'Esperando respuesta del proveedor externo de identidad.',
      now: TEST_NOW,
    });

    await clearBlocked(store, session, {
      initiativeId: 'TEMO-500',
      now: new Date(TEST_NOW.getTime() + 5 * 60 * 60 * 1000),
    });

    const initiative = await store.initiativeById('TEMO-500');
    expect(initiative?.isBlocked).toBe(false);
    expect(initiative?.blockedMsInStage).toBe(5 * 60 * 60 * 1000);
  });
});
