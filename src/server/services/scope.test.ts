import { describe, expect, it } from 'vitest';
import { createDependency, resolveDependency } from './dependencies';
import { clearManualStop, setManualStop } from './blocking';
import { advanceStage, assignInitiative, updateInitiative } from './initiatives';
import { getFlowMetrics } from './metrics';
import { checklistItemId } from '@/domain/workflow';
import { HOUR, TEST_NOW, completeGate, makeInitiative, makeSession, makeTestStore, makeUser } from './test-utils';

/**
 * Ámbito de departamento sobre el trabajo (SEGURIDAD.md §4.2).
 *
 * La matriz de roles abre avanzar fase, asignar y declarar parada a los tres
 * roles; lo que ninguna de esas capacidades incluye es hacerlo sobre la
 * iniciativa de otro departamento.
 */
describe('ámbito del trabajo', () => {
  it('no se avanza la fase de un departamento ajeno', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);
    const outsider = makeSession('DESIGN', 'MEMBER');
    await completeGate(store, 'TEMO-500', 'FEASIBILITY', outsider.userId);

    await expect(
      advanceStage(store, outsider, { initiativeId: 'TEMO-500', now: TEST_NOW }),
    ).rejects.toThrow(/Legal/i);

    // Y la iniciativa no se ha movido.
    expect((await store.initiativeById('TEMO-500'))?.currentStageId).toBe(2);
  });

  it('cualquier rol del área propietaria sí la avanza', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);
    const owner = makeSession('LEGAL', 'MEMBER');
    await completeGate(store, 'TEMO-500', 'FEASIBILITY', owner.userId);

    const result = await advanceStage(store, owner, { initiativeId: 'TEMO-500', now: TEST_NOW });
    expect(result.status).toBe('ADVANCED');
  });

  it('Dirección avanza cualquier iniciativa', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);
    const director = makeSession('MARKETING', 'EXECUTIVE');
    await completeGate(store, 'TEMO-500', 'FEASIBILITY', director.userId);

    const result = await advanceStage(store, director, { initiativeId: 'TEMO-500', now: TEST_NOW });
    expect(result.status).toBe('ADVANCED');
  });

  it('la prioridad la mueve el responsable del área, no cualquiera', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);

    await expect(
      updateInitiative(store, makeSession('LEGAL', 'MEMBER'), {
        initiativeId: 'TEMO-500',
        priority: 'CRITICAL',
        now: TEST_NOW,
      }),
    ).rejects.toThrow(/prioridad/i);

    const updated = await updateInitiative(store, makeSession('LEGAL', 'LEAD'), {
      initiativeId: 'TEMO-500',
      priority: 'CRITICAL',
      now: TEST_NOW,
    });
    expect(updated.priority).toBe('CRITICAL');
  });

  it('los campos descriptivos siguen siendo de edición continua', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);

    // §1.3: cualquiera puede aportar contexto en cualquier momento.
    const updated = await updateInitiative(store, makeSession('DESIGN', 'MEMBER'), {
      initiativeId: 'TEMO-500',
      currentTask: 'Revisando el dictamen con el equipo clínico',
      now: TEST_NOW,
    });
    expect(updated.currentTask).toBe('Revisando el dictamen con el equipo clínico');
  });

  it('no se asigna a nadie en una iniciativa ajena', async () => {
    const legalMember = makeUser({ departments: ['LEGAL'] });
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })], [legalMember]);

    await expect(
      assignInitiative(store, makeSession('TECH', 'MEMBER'), {
        initiativeId: 'TEMO-500',
        assigneeId: legalMember.id,
        now: TEST_NOW,
      }),
    ).rejects.toThrow(/Legal|Dirección/i);
  });

  it('no se declara ni se levanta la parada de un departamento ajeno', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);

    await expect(
      setManualStop(store, makeSession('DESIGN', 'LEAD'), {
        initiativeId: 'TEMO-500',
        stopReason: 'FALTA_CAPACIDAD',
        description: 'Intento de parar trabajo ajeno.',
        now: TEST_NOW,
      }),
    ).rejects.toThrow(/Legal|Dirección/i);
  });
});

/**
 * Estado de parada con dos orígenes (DESIGN.md §7.4): manual e inducido por
 * dependencias bloqueantes. Ni se pisan ni se levantan el uno al otro.
 */
describe('orígenes de la parada', () => {
  const ownerSession = makeSession('LEGAL', 'MEMBER');

  it('abrir la segunda dependencia bloqueante no registra una parada nueva', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);

    await createDependency(store, ownerSession, {
      initiativeId: 'TEMO-500',
      targetDepartment: 'PRODUCT',
      helpType: 'DECISION',
      description: 'Decisión de alcance del plan gratuito.',
      isBlocking: true,
      now: TEST_NOW,
    });
    await createDependency(store, ownerSession, {
      initiativeId: 'TEMO-500',
      targetDepartment: 'TECH',
      helpType: 'RESOURCE',
      description: 'Entorno de staging con Redis dedicado.',
      isBlocking: true,
      now: new Date(TEST_NOW.getTime() + HOUR),
    });

    const log = await store.listActivityLog('TEMO-500');
    // Una sola parada real: dos eventos inflaban el recuento y sumaban
    // intervalos solapados en el panel de dirección.
    expect(log.filter((entry) => entry.actionType === 'BLOCKED_SET')).toHaveLength(1);
  });

  it('resolver la última dependencia no levanta una parada declarada a mano', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);

    await setManualStop(store, ownerSession, {
      initiativeId: 'TEMO-500',
      stopReason: 'FALTA_CAPACIDAD',
      description: 'Sin capacidad hasta el próximo sprint.',
      now: TEST_NOW,
    });
    const dependency = await createDependency(store, ownerSession, {
      initiativeId: 'TEMO-500',
      targetDepartment: 'TECH',
      helpType: 'INFORMATION',
      description: 'Inventario de tablas con datos personales.',
      isBlocking: true,
      now: TEST_NOW,
    });

    await resolveDependency(store, makeSession('TECH', 'MEMBER'), {
      dependencyId: dependency.dependency.id,
      resolutionNotes: 'Inventario enviado.',
      now: new Date(TEST_NOW.getTime() + 2 * HOUR),
    });

    const initiative = await store.initiativeById('TEMO-500');
    expect(initiative?.isBlocked).toBe(true);
    // Vuelve a mandar la causa manual, que nadie ha levantado.
    expect(initiative?.stopReason).toBe('FALTA_CAPACIDAD');
  });

  it('levantar la parada manual la mantiene si queda una dependencia bloqueante', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);

    await setManualStop(store, ownerSession, {
      initiativeId: 'TEMO-500',
      stopReason: 'EXTERNO',
      description: 'Esperando al proveedor externo.',
      now: TEST_NOW,
    });
    await createDependency(store, ownerSession, {
      initiativeId: 'TEMO-500',
      targetDepartment: 'TECH',
      helpType: 'RESOURCE',
      description: 'Acceso al entorno de pruebas del proveedor.',
      isBlocking: true,
      now: TEST_NOW,
    });

    await clearManualStop(store, ownerSession, { initiativeId: 'TEMO-500', now: TEST_NOW });

    const initiative = await store.initiativeById('TEMO-500');
    expect(initiative?.isBlocked).toBe(true);
    expect(initiative?.stopReason).toBe('BLOQUEO_TECNICO');
    expect(initiative?.manualStopReason).toBeNull();
  });

  it('sin causas vivas la parada se levanta y consolida su tiempo', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);

    await setManualStop(store, ownerSession, {
      initiativeId: 'TEMO-500',
      stopReason: 'ESPERANDO_DECISION',
      description: 'Pendiente del comité del viernes.',
      now: TEST_NOW,
    });
    await clearManualStop(store, ownerSession, {
      initiativeId: 'TEMO-500',
      now: new Date(TEST_NOW.getTime() + 5 * HOUR),
    });

    const initiative = await store.initiativeById('TEMO-500');
    expect(initiative?.isBlocked).toBe(false);
    expect(initiative?.blockedMsInStage).toBe(5 * HOUR);
    expect(initiative?.blockedStartedAt).toBeNull();
  });

  it('la parada sobrevive al cambio de fase sin truncar su antigüedad', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);
    await completeGate(store, 'TEMO-500', 'FEASIBILITY', ownerSession.userId);
    await setManualStop(store, ownerSession, {
      initiativeId: 'TEMO-500',
      stopReason: 'ESPERANDO_VALIDACION',
      description: 'Pendiente de la firma clínica.',
      now: TEST_NOW,
    });

    const later = new Date(TEST_NOW.getTime() + 8 * HOUR);
    await advanceStage(store, ownerSession, { initiativeId: 'TEMO-500', now: later });

    const initiative = await store.initiativeById('TEMO-500');
    expect(initiative?.isBlocked).toBe(true);
    // El ancla de contabilidad se reinicia (cada fase descuenta lo suyo)…
    expect(initiative?.blockedSince).toBe(later.toISOString());
    expect(initiative?.blockedMsInStage).toBe(0);
    // …pero la parada sigue teniendo su antigüedad real.
    expect(initiative?.blockedStartedAt).toBe(TEST_NOW.toISOString());
  });

  it('el panel de dirección cuenta una sola parada por episodio', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);

    await createDependency(store, ownerSession, {
      initiativeId: 'TEMO-500',
      targetDepartment: 'PRODUCT',
      helpType: 'DECISION',
      description: 'Decisión de alcance pendiente.',
      isBlocking: true,
      now: TEST_NOW,
    });
    await createDependency(store, ownerSession, {
      initiativeId: 'TEMO-500',
      targetDepartment: 'TECH',
      helpType: 'RESOURCE',
      description: 'Entorno de pruebas pendiente.',
      isBlocking: true,
      now: TEST_NOW,
    });

    const metrics = await getFlowMetrics(store, { now: new Date(TEST_NOW.getTime() + 3 * HOUR) });
    const total = metrics.stopCauses.reduce((count, cause) => count + cause.count, 0);
    expect(total).toBe(1);
    expect(metrics.stopCauses[0]?.totalMs).toBe(3 * HOUR);
  });
});

describe('integridad de las solicitudes de ayuda', () => {
  it('no se pide ayuda al propio departamento propietario', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);

    await expect(
      createDependency(store, makeSession('LEGAL', 'MEMBER'), {
        initiativeId: 'TEMO-500',
        targetDepartment: 'LEGAL',
        helpType: 'VALIDATION',
        description: 'Autoasignarse una parada bloqueante.',
        isBlocking: true,
        now: TEST_NOW,
      }),
    ).rejects.toThrow(/otro departamento/i);
  });

  it('el requisito vinculado tiene que ser de la fase en curso', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);

    await expect(
      createDependency(store, makeSession('LEGAL', 'MEMBER'), {
        initiativeId: 'TEMO-500',
        targetDepartment: 'DESIGN',
        helpType: 'VALIDATION',
        description: 'Vínculo con un requisito de otra fase.',
        isBlocking: false,
        checklistItemId: checklistItemId('CO_DESIGN', 1),
        now: TEST_NOW,
      }),
    ).rejects.toThrow(/fase actual/i);
  });

  it('la solicitud guarda su texto en la caja negra', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);

    await createDependency(store, makeSession('LEGAL', 'MEMBER'), {
      initiativeId: 'TEMO-500',
      targetDepartment: 'TECH',
      helpType: 'INFORMATION',
      description: 'Necesitamos el coste estimado de inferencia del asistente.',
      isBlocking: false,
      now: TEST_NOW,
    });

    const log = await store.listActivityLog('TEMO-500');
    const created = log.find((entry) => entry.actionType === 'DEPENDENCY_CREATED');
    expect(JSON.stringify(created?.newValue)).toContain('coste estimado de inferencia');
  });
});

describe('calidad del registro', () => {
  it('la edición registra los valores con su tipo, no como texto', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);

    await updateInitiative(store, makeSession('LEGAL', 'LEAD'), {
      initiativeId: 'TEMO-500',
      links: [{ kind: 'FIGMA', label: 'Prototipo', url: 'https://figma.com/file/nuevo' }],
      now: TEST_NOW,
    });

    const log = await store.listActivityLog('TEMO-500');
    const entry = log.find((item) => item.actionType === 'INITIATIVE_UPDATED');
    const added = (entry?.newValue as Record<string, unknown>).links;
    // Antes se guardaba la longitud del array: imposible saber qué enlace entró.
    expect(added).toEqual(['https://figma.com/file/nuevo']);
  });

  it('la firma del avance excepcional guarda la IP de confianza, no la declarada', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);
    const lead = makeSession('LEGAL', 'LEAD');
    const gate = await store.listChecklistItems(2);

    const result = await advanceStage(store, lead, {
      initiativeId: 'TEMO-500',
      override: {
        reason: 'El expediente debe presentarse antes del cierre de mes ante la autoridad.',
        riskAccepted: 'Asumimos posible retrabajo si el dictamen exige un alcance mayor.',
        signature: 'CONFIRMAR EXCEPCION',
        acknowledgedPendingIds: gate.map((item) => item.id),
      },
      request: { ip: '10.20.0.14', ipChain: '1.2.3.4 → 10.20.0.14', userAgent: 'pruebas' },
      now: TEST_NOW,
    });

    expect(result.status).toBe('ADVANCED');
    const log = await store.listActivityLog('TEMO-500');
    const override = log.find((entry) => entry.actionType === 'EXCEPTION_OVERRIDE');
    expect(override?.overrideMetadata?.ip).toBe('10.20.0.14');
    expect(override?.overrideMetadata?.ipChain).toContain('1.2.3.4');
  });
});
