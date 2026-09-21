import { describe, expect, it } from 'vitest';
import { STAGE_ID_BY_KEY } from '@/domain/workflow';
import { advanceStage } from './initiatives';
import { evaluateGate } from './gate';
import {
  TEST_NOW,
  completeGate,
  makeInitiative,
  makeSession,
  makeTestStore,
} from './test-utils';

/**
 * Invariante 1 (AGENTS.md §5.1): la compuerta de salida exige el 100 % de la
 * checklist. Sin ella no hay avance, y el sistema nunca responde con un error
 * pasivo: devuelve los pendientes y a quién pedírselos.
 */
describe('compuerta de salida', () => {
  it('con la checklist incompleta no avanza y devuelve los pendientes', async () => {
    const { store } = makeTestStore();
    const session = makeSession('LEGAL', 'MEMBER');

    const result = await advanceStage(store, session, { initiativeId: 'TEMO-500', now: TEST_NOW });

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

    const result = await advanceStage(store, session, { initiativeId: 'TEMO-500', now: TEST_NOW });

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

    await expect(advanceStage(store, session, { initiativeId: 'TEMO-500', now: TEST_NOW })).rejects.toThrow(
      /última fase/i,
    );
  });

  it('solo cuenta como pendientes los items obligatorios de la fase actual', async () => {
    const { store } = makeTestStore();
    const gate = await evaluateGate(store, makeInitiative());

    expect(gate.stage.key).toBe('FEASIBILITY');
    expect(gate.mandatoryCount).toBe(gate.items.filter((item) => item.item.isMandatory).length);
    expect(gate.items.every((item) => item.item.stageId === STAGE_ID_BY_KEY.FEASIBILITY)).toBe(true);
  });
});
