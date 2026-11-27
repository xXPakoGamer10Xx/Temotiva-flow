import { describe, expect, it } from 'vitest';
import { STAGE_ID_BY_KEY } from '@/domain/workflow';
import { advanceStage } from './initiatives';
import { evaluateGate } from './gate';
import {
  TEST_NOW,
  approveSignoff,
  completeGate,
  makeInitiative,
  makeSession,
  makeTestStore, TEST_ADVANCE_NOTE } from './test-utils';

/**
 * Invariante 1 (AGENTS.md §5.1): la compuerta de salida exige el 100 % de la
 * checklist. Sin ella no hay avance, y el sistema nunca responde con un error
 * pasivo: devuelve los pendientes y a quién pedírselos.
 */
describe('compuerta de salida', () => {
  it('con la checklist incompleta no avanza y devuelve los pendientes', async () => {
    const { store } = makeTestStore();
    const session = makeSession('LEGAL', 'MEMBER');

    const result = await advanceStage(store, session, { note: TEST_ADVANCE_NOTE, initiativeId: 'TEMO-500', now: TEST_NOW });

    expect(result.status).toBe('GATE_BLOCKED');
    if (result.status !== 'GATE_BLOCKED') throw new Error('se esperaba la compuerta cerrada');

    expect(result.gate.pending.length).toBeGreaterThan(0);
    expect(result.nextStage.key).toBe('CO_DESIGN');
    // Cada pendiente sabe a qué departamento pedírselo (botón de un clic).
    for (const item of result.gate.pending) {
      expect(item.responsibleDepartment).toBeTruthy();
    }

    const unchanged = await store.initiativeById('TEMO-500');
    expect(unchanged?.currentStageId).toBe(STAGE_ID_BY_KEY.FEASIBILITY);
    expect(await store.listActivityLog('TEMO-500')).toHaveLength(0);
  });

  it('con la checklist al 100 % transiciona, traslada la propiedad y registra el evento', async () => {
    const { store } = makeTestStore([makeInitiative({ currentAssigneeId: '00000000-0000-4000-8000-000000000001' })]);
    const session = makeSession('LEGAL', 'MEMBER');
    await completeGate(store, 'TEMO-500', 'FEASIBILITY', session.userId);

    const result = await advanceStage(store, session, { note: TEST_ADVANCE_NOTE, initiativeId: 'TEMO-500', now: TEST_NOW });

    expect(result.status).toBe('ADVANCED');
    const initiative = await store.initiativeById('TEMO-500');
    expect(initiative?.currentStageId).toBe(STAGE_ID_BY_KEY.CO_DESIGN);
    // Invariante 6: la propiedad viaja con la fase y se libera la asignación.
    expect(initiative?.ownerDepartment).toBe('DESIGN');
    expect(initiative?.currentAssigneeId).toBeNull();
    expect(initiative?.stageEnteredAt).toBe(TEST_NOW.toISOString());

    const log = await store.listActivityLog('TEMO-500');
    expect(log).toHaveLength(1);
    expect(log[0]?.actionType).toBe('STAGE_TRANSITION');
    expect(log[0]?.userId).toBe(session.userId);
  });

  it('no permite avanzar más allá de la última fase', async () => {
    const { store } = makeTestStore([
      makeInitiative({ currentStageId: STAGE_ID_BY_KEY.PROD, ownerDepartment: 'TECH' }),
    ]);
    const session = makeSession('TECH', 'LEAD');
    await completeGate(store, 'TEMO-500', 'PROD', session.userId);

    await expect(advanceStage(store, session, { note: TEST_ADVANCE_NOTE, initiativeId: 'TEMO-500', now: TEST_NOW })).rejects.toThrow(
      /última fase/i,
    );
  });

  it('la guía de la fase se muestra pero no bloquea: bloquean las aprobaciones de área (spec 005 §5.3)', async () => {
    const { store } = makeTestStore();
    const gate = await evaluateGate(store, makeInitiative());

    expect(gate.stage.key).toBe('FEASIBILITY');
    expect(gate.items.length).toBeGreaterThan(0);
    expect(gate.items.every((item) => item.item.stageId === STAGE_ID_BY_KEY.FEASIBILITY)).toBe(true);
    expect(gate.mandatoryCount).toBe(3);
    expect(gate.pending.map((item) => item.id)).toEqual([
      'SIGNOFF:FEASIBILITY:LEGAL',
      'SIGNOFF:FEASIBILITY:CYBER',
      'SIGNOFF:FEASIBILITY:TECH',
    ]);
    expect(gate.pending[0]).toMatchObject({ label: 'Aprobación de Legal / DPO', responsibleDepartment: 'LEGAL' });
  });

  it('marcar toda la guía antigua no abre la compuerta (P-1: no se fabrican firmas)', async () => {
    const { store } = makeTestStore();
    for (const item of await store.listChecklistItems(STAGE_ID_BY_KEY.FEASIBILITY)) {
      await store.upsertChecklistValue({
        initiativeId: 'TEMO-500',
        checklistId: item.id,
        isCompleted: true,
        completedBy: 'u-legacy',
        completedAt: TEST_NOW.toISOString(),
      });
    }
    const gate = await evaluateGate(store, makeInitiative());
    expect(gate.isComplete).toBe(false);
    expect(gate.signoffs.every((state) => state.signoff === null)).toBe(true);
  });

  it('cada fase exige exactamente las áreas de la matriz', async () => {
    const expected = {
      IDEATION: ['PSYCHOLOGY', 'PRODUCT'],
      FEASIBILITY: ['LEGAL', 'CYBER', 'TECH'],
      CO_DESIGN: ['DESIGN'],
      READY: ['LEGAL', 'PRODUCT', 'PSYCHOLOGY'],
      DEV: ['TECH'],
      QA: ['CYBER', 'QA'],
      PROD: ['TECH'],
    } as const;
    const { store } = makeTestStore();
    for (const [key, departments] of Object.entries(expected)) {
      const gate = await evaluateGate(
        store,
        makeInitiative({ currentStageId: STAGE_ID_BY_KEY[key as keyof typeof expected] }),
      );
      expect(gate.pending.map((item) => item.responsibleDepartment)).toEqual(departments);
    }
  });

  it('una aprobación sin su requisito extra (T-shirt) no cuenta', async () => {
    const { store } = makeTestStore();
    await approveSignoff(store, 'TEMO-500', 'FEASIBILITY', 'LEGAL', 'u-1');
    await approveSignoff(store, 'TEMO-500', 'FEASIBILITY', 'CYBER', 'u-2');
    await store.upsertStageSignoff(
      {
        initiativeId: 'TEMO-500',
        stageId: STAGE_ID_BY_KEY.FEASIBILITY,
        department: 'TECH',
        isApproved: true,
        approvedBy: 'u-3',
        approvedAt: TEST_NOW.toISOString(),
        note: null,
        noObservations: false,
        tshirtSize: null,
        updatedAt: TEST_NOW.toISOString(),
      },
      { expectedStageId: STAGE_ID_BY_KEY.FEASIBILITY },
    );
    const gate = await evaluateGate(store, makeInitiative());
    expect(gate.completedCount).toBe(2);
    expect(gate.pending.map((item) => item.id)).toEqual(['SIGNOFF:FEASIBILITY:TECH']);
  });

  it('las aprobaciones de otra fase no cuentan para la actual', async () => {
    const { store } = makeTestStore([makeInitiative({ currentStageId: STAGE_ID_BY_KEY.DEV, ownerDepartment: 'TECH' })]);
    await approveSignoff(store, 'TEMO-500', 'DEV', 'TECH', 'u-1');
    const initiative = await store.initiativeById('TEMO-500');
    if (!initiative) throw new Error('iniciativa no encontrada');
    expect((await evaluateGate(store, initiative)).isComplete).toBe(true);
    expect((await evaluateGate(store, { ...initiative, currentStageId: STAGE_ID_BY_KEY.PROD })).isComplete).toBe(false);
  });
});
