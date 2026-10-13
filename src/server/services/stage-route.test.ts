import { describe, expect, it } from 'vitest';
import { STAGE_ID_BY_KEY } from '@/domain/workflow';
import { advanceStage, createInitiative } from './initiatives';
import { restoreStage, skipStage } from './stage-route';
import { TEST_NOW, completeGate, makeInitiative, makeSession, makeTestStore, makeUser, sessionOf } from './test-utils';

const REASON = 'No requiere dictamen: no trata datos de salud ni de personas.';

/** Invariante 9 (AGENTS.md §5): fases secuenciales; "No aplica" solo con motivo y por el área dueña. */
describe('ruta de fases', () => {
  it('avanza saltando la fase omitida, con la compuerta de la actual y la propiedad de la destino', async () => {
    const lead = makeSession('LEGAL', 'LEAD');
    const { store } = makeTestStore([makeInitiative({ currentStageId: STAGE_ID_BY_KEY.IDEATION, ownerDepartment: 'PRODUCT' })]);
    await skipStage(store, lead, { initiativeId: 'TEMO-500', stageId: STAGE_ID_BY_KEY.FEASIBILITY, reason: REASON, now: TEST_NOW });

    const product = makeSession('PRODUCT', 'MEMBER');
    const blocked = await advanceStage(store, product, { initiativeId: 'TEMO-500', now: TEST_NOW });
    expect(blocked.status).toBe('GATE_BLOCKED');
    if (blocked.status === 'GATE_BLOCKED') expect(blocked.nextStage.key).toBe('CO_DESIGN');

    await completeGate(store, 'TEMO-500', 'IDEATION', product.userId);
    const result = await advanceStage(store, product, { initiativeId: 'TEMO-500', now: TEST_NOW });
    expect(result.status).toBe('ADVANCED');
    const after = await store.initiativeById('TEMO-500');
    expect(after?.currentStageId).toBe(STAGE_ID_BY_KEY.CO_DESIGN);
    expect(after?.ownerDepartment).toBe('DESIGN');
    const log = await store.listActivityLog('TEMO-500');
    expect(log.some((e) => e.actionType === 'STAGE_SKIPPED')).toBe(true);
  });

  it('no se omite la actual, una pasada, la primera ni la última', async () => {
    const exec = makeSession('PRODUCT', 'EXECUTIVE');
    const { store } = makeTestStore([makeInitiative({ currentStageId: STAGE_ID_BY_KEY.CO_DESIGN })]);
    for (const key of ['CO_DESIGN', 'FEASIBILITY', 'IDEATION', 'PROD'] as const) {
      await expect(
        skipStage(store, exec, { initiativeId: 'TEMO-500', stageId: STAGE_ID_BY_KEY[key], reason: REASON }),
      ).rejects.toThrow();
    }
  });

  it('permisos: LEAD del área dueña y Dirección sí; otra área y MEMBER no', async () => {
    const { store } = makeTestStore([makeInitiative({ currentStageId: STAGE_ID_BY_KEY.IDEATION })]);
    const input = { initiativeId: 'TEMO-500', stageId: STAGE_ID_BY_KEY.FEASIBILITY, reason: REASON, now: TEST_NOW };
    await expect(skipStage(store, makeSession('TECH', 'LEAD'), input)).rejects.toThrow(/Legal/);
    await expect(skipStage(store, makeSession('LEGAL', 'MEMBER'), input)).rejects.toThrow(/Legal/);
    await skipStage(store, makeSession('PRODUCT', 'EXECUTIVE'), input);
    expect((await store.initiativeById('TEMO-500'))?.skippedStageIds).toEqual([STAGE_ID_BY_KEY.FEASIBILITY]);
  });

  it('exige motivo de al menos 30 caracteres y se puede restaurar', async () => {
    const lead = makeSession('LEGAL', 'LEAD');
    const { store } = makeTestStore([makeInitiative({ currentStageId: STAGE_ID_BY_KEY.IDEATION })]);
    const input = { initiativeId: 'TEMO-500', stageId: STAGE_ID_BY_KEY.FEASIBILITY, now: TEST_NOW };
    await expect(skipStage(store, lead, { ...input, reason: 'No aplica' })).rejects.toThrow(/mínimo/);
    await skipStage(store, lead, { ...input, reason: REASON });
    await restoreStage(store, lead, { ...input, reason: 'Resulta que sí hay datos personales.' });
    expect((await store.initiativeById('TEMO-500'))?.skippedStageIds).toEqual([]);
    expect((await store.listActivityLog('TEMO-500')).map((e) => e.actionType)).toEqual(['STAGE_SKIPPED', 'STAGE_RESTORED']);
  });

  it('crear con ruta valida permisos por fase, exige motivo y registra un evento por fase', async () => {
    const lead = sessionOf(makeUser({ departments: ['LEGAL'], role: 'LEAD' }));
    const { store } = makeTestStore([]);
    const base = { title: 'Iniciativa con ruta reducida', description: '', priority: 'NORMAL' as const, priorityReason: 'ROADMAP' as const, now: TEST_NOW };

    await expect(createInitiative(store, lead, { ...base, skippedStageIds: [STAGE_ID_BY_KEY.FEASIBILITY] })).rejects.toThrow(/mínimo/);
    await expect(
      createInitiative(store, lead, { ...base, skippedStageIds: [STAGE_ID_BY_KEY.QA], routeReason: REASON }),
    ).rejects.toThrow(/QA/);

    const created = await createInitiative(store, lead, { ...base, skippedStageIds: [STAGE_ID_BY_KEY.FEASIBILITY], routeReason: REASON });
    expect(created.skippedStageIds).toEqual([STAGE_ID_BY_KEY.FEASIBILITY]);
    const log = await store.listActivityLog(created.id);
    expect(log.filter((e) => e.actionType === 'STAGE_SKIPPED')).toHaveLength(1);
  });
});
