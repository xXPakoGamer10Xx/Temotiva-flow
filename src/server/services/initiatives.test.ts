import { describe, expect, it } from 'vitest';
import type { CreateInitiativeInput } from './initiatives';
import { archiveInitiative, assignInitiative, createInitiative, reassignOwner, restoreInitiative } from './initiatives';
import { setChecklistItemState } from './checklist';
import { STAGE_ID_BY_KEY, checklistItemId } from '@/domain/workflow';
import { TEST_NOW, makeInitiative, makeSession, makeTestStore, makeUser, sessionOf } from './test-utils';

/**
 * Invariantes 6, 7 y 8 (AGENTS.md §5): propiedad, prioridad con motivo
 * obligatorio y archivado como borrado lógico.
 */
describe('ciclo de vida de la iniciativa', () => {
  it('nace en Ideación, con el propietario por defecto de la fase y sin asignar', async () => {
    const { store } = makeTestStore([]);
    const session = makeSession('PSYCHOLOGY', 'MEMBER');

    const initiative = await createInitiative(store, session, {
      title: 'Journaling guiado con ACT',
      description: 'Secuencia de journaling tras un pico de ansiedad.',
      priority: 'HIGH',
      priorityReason: 'B2B_CLIENT',
      now: TEST_NOW,
    });

    expect(initiative.currentStageId).toBe(STAGE_ID_BY_KEY.IDEATION);
    expect(initiative.ownerDepartment).toBe('PRODUCT');
    expect(initiative.currentAssigneeId).toBeNull();
    expect(initiative.createdBy).toBe(session.userId);

    const log = await store.listActivityLog(initiative.id);
    expect(log[0]?.actionType).toBe('INITIATIVE_CREATED');
  });

  it('permite crear la iniciativa en un área propia distinta de la de la fase', async () => {
    const { store } = makeTestStore([]);
    const session = makeSession('PSYCHOLOGY', 'MEMBER');

    const initiative = await createInitiative(store, session, {
      title: 'Protocolo de escucha activa',
      description: '',
      priority: 'NORMAL',
      priorityReason: 'ROADMAP',
      ownerDepartment: 'PSYCHOLOGY',
      now: TEST_NOW,
    });

    expect(initiative.ownerDepartment).toBe('PSYCHOLOGY');
    const log = await store.listActivityLog(initiative.id);
    expect(log[0]?.newValue).toMatchObject({ ownerDepartment: 'PSYCHOLOGY', ownerChosen: true });
  });

  it('no deja crear para un área ajena, salvo a Dirección', async () => {
    const { store } = makeTestStore([]);
    const base = {
      title: 'Iniciativa para otra área',
      description: '',
      priority: 'NORMAL' as const,
      priorityReason: 'ROADMAP' as const,
      ownerDepartment: 'LEGAL' as const,
      now: TEST_NOW,
    };

    await expect(createInitiative(store, makeSession('TECH', 'MEMBER'), base)).rejects.toThrow(/propias áreas/);
    await expect(createInitiative(store, makeSession('TECH', 'LEAD'), base)).rejects.toThrow(/propias áreas/);
    const byExecutive = await createInitiative(store, makeSession('TECH', 'EXECUTIVE'), base);
    expect(byExecutive.ownerDepartment).toBe('LEGAL');
  });

  it('abre solicitudes de ayuda no bloqueantes al crear, sin cambiar de dueño', async () => {
    const { store } = makeTestStore([]);
    const session = makeSession('PSYCHOLOGY', 'MEMBER');

    const initiative = await createInitiative(store, session, {
      title: 'Evaluación de riesgo clínico',
      description: '',
      priority: 'HIGH',
      priorityReason: 'REGULATORY_RISK',
      ownerDepartment: 'PSYCHOLOGY',
      helpDepartments: ['LEGAL', 'QA', 'LEGAL'],
      helpType: 'VALIDATION',
      now: TEST_NOW,
    });

    const dependencies = await store.listDependencies(initiative.id);
    expect(dependencies.map((dependency) => dependency.targetDepartment).sort()).toEqual(['LEGAL', 'QA']);
    expect(dependencies.every((dependency) => !dependency.isBlocking && dependency.helpType === 'VALIDATION')).toBe(true);
    expect((await store.initiativeById(initiative.id))?.ownerDepartment).toBe('PSYCHOLOGY');
    expect((await store.initiativeById(initiative.id))?.isBlocked).toBe(false);
  });

  it('rechaza pedir ayuda al propio área responsable', async () => {
    const { store } = makeTestStore([]);
    const session = makeSession('PSYCHOLOGY', 'MEMBER');

    await expect(
      createInitiative(store, session, {
        title: 'Ayuda a uno mismo',
        description: '',
        priority: 'NORMAL',
        priorityReason: 'ROADMAP',
        ownerDepartment: 'PSYCHOLOGY',
        helpDepartments: ['PSYCHOLOGY'],
        now: TEST_NOW,
      }),
    ).rejects.toThrow(/ya es el área responsable/);
    expect(await store.listInitiatives()).toHaveLength(0);
  });

  it('exige prioridad y motivo de prioridad', async () => {
    const { store } = makeTestStore([]);
    const session = makeSession('PRODUCT', 'MEMBER');

    // El tipo lo impide; la comprobación existe porque el dominio no confía en
    // que la capa de entrada haya validado.
    const input = {
      title: 'Iniciativa sin motivo declarado',
      description: '',
      priority: 'HIGH',
    } as unknown as CreateInitiativeInput;

    await expect(createInitiative(store, session, input)).rejects.toThrow(/prioridad|motivo/i);
  });

  it('numera las iniciativas de forma secuencial', async () => {
    const { store } = makeTestStore([makeInitiative({ id: 'TEMO-118' })]);
    const session = makeSession('PRODUCT', 'MEMBER');

    const created = await createInitiative(store, session, {
      title: 'Otra iniciativa de prueba',
      description: '',
      priority: 'NORMAL',
      priorityReason: 'ROADMAP',
      now: TEST_NOW,
    });

    expect(created.id).toBe('TEMO-119');
  });

  it('reasignar la propiedad exige rol y motivo, y queda registrado', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);

    await expect(
      reassignOwner(store, makeSession('LEGAL', 'MEMBER'), {
        initiativeId: 'TEMO-500',
        targetDepartment: 'TECH',
        reason: 'Legal ya emitió su dictamen y el resto es técnico.',
        now: TEST_NOW,
      }),
    ).rejects.toThrow(/responsable de área|Dirección/i);

    await expect(
      reassignOwner(store, makeSession('LEGAL', 'LEAD'), {
        initiativeId: 'TEMO-500',
        targetDepartment: 'TECH',
        reason: 'corto',
        now: TEST_NOW,
      }),
    ).rejects.toThrow(/motivo/i);

    await reassignOwner(store, makeSession('LEGAL', 'LEAD'), {
      initiativeId: 'TEMO-500',
      targetDepartment: 'TECH',
      reason: 'Legal ya emitió su dictamen y el resto del trabajo es técnico.',
      now: TEST_NOW,
    });

    const initiative = await store.initiativeById('TEMO-500');
    expect(initiative?.ownerDepartment).toBe('TECH');
    expect(initiative?.currentAssigneeId).toBeNull();

    const log = await store.listActivityLog('TEMO-500');
    expect(log.some((entry) => entry.actionType === 'OWNER_REASSIGNED')).toBe(true);
  });

  it('solo asigna a personas activas del departamento propietario', async () => {
    const legalMember = makeUser({ departments: ['LEGAL'], role: 'MEMBER' });
    const designMember = makeUser({ departments: ['DESIGN'], role: 'MEMBER' });
    const inactive = makeUser({ departments: ['LEGAL'], role: 'MEMBER', isActive: false });
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })], [
      legalMember,
      designMember,
      inactive,
    ]);
    const session = sessionOf(legalMember);

    await expect(
      assignInitiative(store, session, { initiativeId: 'TEMO-500', assigneeId: designMember.id, now: TEST_NOW }),
    ).rejects.toThrow(/departamento propietario/i);

    await expect(
      assignInitiative(store, session, { initiativeId: 'TEMO-500', assigneeId: inactive.id, now: TEST_NOW }),
    ).rejects.toThrow(/acceso activo/i);

    const updated = await assignInitiative(store, session, {
      initiativeId: 'TEMO-500',
      assigneeId: legalMember.id,
      now: TEST_NOW,
    });
    expect(updated.currentAssigneeId).toBe(legalMember.id);
  });

  it('archiva como borrado lógico y conserva intacta la caja negra', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);
    const session = makeSession('LEGAL', 'LEAD');

    await setChecklistItemState(store, session, {
      initiativeId: 'TEMO-500',
      checklistItemId: checklistItemId('FEASIBILITY', 1),
      isCompleted: true,
      now: TEST_NOW,
    });

    await archiveInitiative(store, session, {
      initiativeId: 'TEMO-500',
      reason: 'Iniciativa descartada tras el comité de gobernanza.',
      now: TEST_NOW,
    });

    expect(await store.listInitiatives()).toHaveLength(0);
    expect(await store.listInitiatives({ includeArchived: true })).toHaveLength(1);

    const log = await store.listActivityLog('TEMO-500');
    expect(log.some((entry) => entry.actionType === 'CHECKLIST_UPDATED')).toBe(true);
    expect(log.some((entry) => entry.actionType === 'INITIATIVE_ARCHIVED')).toBe(true);

    await restoreInitiative(store, session, { initiativeId: 'TEMO-500', now: TEST_NOW });
    expect(await store.listInitiatives()).toHaveLength(1);
  });

  it('un MEMBER no puede archivar', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);

    await expect(
      archiveInitiative(store, makeSession('LEGAL', 'MEMBER'), {
        initiativeId: 'TEMO-500',
        reason: 'Ya no tiene sentido mantenerla.',
        now: TEST_NOW,
      }),
    ).rejects.toThrow(/responsable|Dirección/i);
  });
});
