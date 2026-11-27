import { describe, expect, it } from 'vitest';
import { STAGE_ID_BY_KEY } from '@/domain/workflow';
import { advanceStage, finalizeInitiative } from './initiatives';
import { getFlowMetrics } from './metrics';
import { setStageSignoff } from './signoffs';
import { getBoardView, getFinalizedView, getInitiativeDetail, getMyWork, getRadarRows } from './views';
import {
  TEST_ADVANCE_NOTE,
  TEST_NOW,
  completeGate,
  makeInitiative,
  makeSession,
  makeTestStore,
  makeUser,
  sessionOf,
} from './test-utils';

/** Proyecciones de la spec 005 (T-09): historial, aprobaciones y finalizadas. */

async function finalizedStore() {
  const tech = makeUser({ name: 'Víctor Pardo', departments: ['TECH'], role: 'MEMBER' });
  const context = makeTestStore(
    [
      makeInitiative({ id: 'TEMO-500', currentStageId: STAGE_ID_BY_KEY.PROD, ownerDepartment: 'TECH' }),
      makeInitiative({ id: 'TEMO-501', currentStageId: STAGE_ID_BY_KEY.PROD, ownerDepartment: 'TECH' }),
    ],
    [tech],
  );
  await completeGate(context.store, 'TEMO-500', 'PROD', tech.id);
  await finalizeInitiative(context.store, sessionOf(tech), { initiativeId: 'TEMO-500', note: TEST_ADVANCE_NOTE, now: TEST_NOW });
  return { ...context, tech };
}

describe('finalizadas fuera del tablero (RF-19)', () => {
  it('no salen en tablero, WIP, radar ni mi trabajo; sí en /finalizadas', async () => {
    const { store, tech } = await finalizedStore();
    const columns = await getBoardView(store, { now: TEST_NOW });
    const prod = columns.find((column) => column.stage.key === 'PROD');
    expect(prod?.cards.map((card) => card.id)).toEqual(['TEMO-501']);
    expect(prod?.wipCount).toBe(1);
    // Ni siquiera con el filtro de archivadas.
    const withArchived = await getBoardView(store, { now: TEST_NOW, includeArchived: true });
    expect(withArchived.flatMap((column) => column.cards).map((card) => card.id)).not.toContain('TEMO-500');

    expect((await getRadarRows(store, { now: TEST_NOW })).map((row) => row.initiativeId)).toEqual(['TEMO-501']);
    const myWork = await getMyWork(store, sessionOf(tech), { now: TEST_NOW });
    expect([...myWork.waiting, ...myWork.unassignedInMyArea].map((item) => item.card.id)).not.toContain('TEMO-500');

    const finalized = await getFinalizedView(store);
    expect(finalized).toHaveLength(1);
    expect(finalized[0]).toMatchObject({ id: 'TEMO-500', finalizedBy: { name: 'Víctor Pardo' } });
    expect(await getFinalizedView(store, { query: 'temo-501' })).toEqual([]);
  });

  it('el panel de dirección las cuenta como entregadas y no como activas', async () => {
    const { store } = await finalizedStore();
    const metrics = await getFlowMetrics(store, { now: TEST_NOW });
    expect(metrics.headline.finalizedInitiatives).toBe(1);
    expect(metrics.headline.activeInitiatives).toBe(1);
  });
});

describe('ficha: aprobaciones e historial (RF-13)', () => {
  it('pinta quién aprobó y marca la aprobación en nombre del área', async () => {
    const executive = makeUser({ name: 'Marta Coll', departments: ['PRODUCT'], role: 'EXECUTIVE' });
    const { store } = makeTestStore([makeInitiative()], [executive]);
    await setStageSignoff(store, sessionOf(executive), {
      initiativeId: 'TEMO-500',
      stageId: STAGE_ID_BY_KEY.FEASIBILITY,
      department: 'LEGAL',
      approved: true,
      noObservations: true,
      now: TEST_NOW,
    });

    const detail = await getInitiativeDetail(store, 'TEMO-500', { now: TEST_NOW });
    expect(detail.signoffs.map((signoff) => signoff.department)).toEqual(['LEGAL', 'CYBER', 'TECH']);
    expect(detail.signoffs[0]).toMatchObject({
      isApproved: true,
      isSatisfied: true,
      approvedBy: { name: 'Marta Coll' },
      onBehalf: true,
      noObservations: true,
    });
    expect(detail.gate).toMatchObject({ completed: 1, total: 3, isComplete: false });
  });

  it('cada cierre de fase es un bloque con nota, autor, aprobaciones y talla', async () => {
    const legal = makeUser({ name: 'Rosa Iglesias', departments: ['LEGAL'], role: 'MEMBER' });
    const { store } = makeTestStore([makeInitiative()], [legal]);
    await completeGate(store, 'TEMO-500', 'FEASIBILITY', legal.id);
    await advanceStage(store, sessionOf(legal), { initiativeId: 'TEMO-500', note: TEST_ADVANCE_NOTE, now: TEST_NOW });

    const detail = await getInitiativeDetail(store, 'TEMO-500', { now: TEST_NOW });
    expect(detail.history).toHaveLength(1);
    expect(detail.history[0]).toMatchObject({
      stageName: 'Viabilidad',
      toStageName: 'Diseño',
      kind: 'ADVANCED',
      note: TEST_ADVANCE_NOTE,
      isLegacy: false,
      closedBy: { name: 'Rosa Iglesias' },
      tshirtSize: 'M',
    });
    expect(detail.history[0]?.signoffs.every((signoff) => signoff.isSatisfied)).toBe(true);
    expect(detail.tshirtSize).toBe('M');
    expect(detail.stage.name).toBe('Diseño');
  });

  it('un avance anterior a la nota obligatoria se rotula como tal', async () => {
    const { store } = makeTestStore();
    await store.appendActivityLog({
      initiativeId: 'TEMO-500',
      userId: makeSession('PRODUCT', 'MEMBER').userId,
      actionType: 'STAGE_TRANSITION',
      fromStageId: STAGE_ID_BY_KEY.IDEATION,
      toStageId: STAGE_ID_BY_KEY.FEASIBILITY,
      fieldName: 'current_stage_id',
      oldValue: { stageKey: 'IDEATION' },
      newValue: { stageKey: 'FEASIBILITY', netDurationMs: 1000 },
      overrideMetadata: null,
      createdAt: '2026-09-01T10:00:00.000Z',
    });
    const [block] = (await getInitiativeDetail(store, 'TEMO-500', { now: TEST_NOW })).history;
    expect(block).toMatchObject({ stageName: 'Ideación', isLegacy: true, note: null, netDurationMs: 1000 });
    expect(block?.signoffs.every((signoff) => !signoff.isApproved)).toBe(true);
  });

  it('la finalización aparece como último bloque y en `finalized`', async () => {
    const { store, tech } = await finalizedStore();
    const detail = await getInitiativeDetail(store, 'TEMO-500', { now: TEST_NOW });
    expect(detail.history.at(-1)).toMatchObject({ kind: 'FINALIZED', stageName: 'Producción', toStageName: null });
    expect(detail.finalized).toMatchObject({ at: TEST_NOW.toISOString(), by: { id: tech.id } });
    expect(detail.card.isFinalized).toBe(true);
  });
});
