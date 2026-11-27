import { describe, expect, it } from 'vitest';
import { STAGE_ID_BY_KEY } from '@/domain/workflow';
import { evaluateGate } from './gate';
import { setStageSignoff } from './signoffs';
import { addCustomCheck, removeCustomCheck, setCustomCheckState } from './custom-checks';
import { TEST_NOW, makeInitiative, makeSession, makeTestStore } from './test-utils';

const FEASIBILITY = STAGE_ID_BY_KEY.FEASIBILITY;

/** Aprobaciones por área y casillas adicionales (spec 005, AC-5..AC-9). */
describe('aprobación de área', () => {
  it('AC-5: un área ajena no aprueba; Dirección sí, con su identidad de sesión', async () => {
    const { store } = makeTestStore([makeInitiative({ currentStageId: STAGE_ID_BY_KEY.READY, ownerDepartment: 'PRODUCT' })]);
    await expect(
      setStageSignoff(store, makeSession('DESIGN', 'MEMBER'), {
        initiativeId: 'TEMO-500',
        stageId: STAGE_ID_BY_KEY.READY,
        department: 'LEGAL',
        approved: true,
        now: TEST_NOW,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const executive = makeSession('PRODUCT', 'EXECUTIVE');
    const signoff = await setStageSignoff(store, executive, {
      initiativeId: 'TEMO-500',
      stageId: STAGE_ID_BY_KEY.READY,
      department: 'LEGAL',
      approved: true,
      now: TEST_NOW,
    });
    expect(signoff).toMatchObject({ isApproved: true, approvedBy: executive.userId, approvedAt: TEST_NOW.toISOString() });

    const [entry] = await store.listActivityLog('TEMO-500');
    expect(entry).toMatchObject({ actionType: 'STAGE_SIGNOFF_GRANTED', userId: executive.userId });
  });

  it('AC-6: Legal exige nota o «Sin observaciones»; Tech exige talla', async () => {
    const { store } = makeTestStore();
    const legal = makeSession('LEGAL', 'MEMBER');
    const tech = makeSession('TECH', 'MEMBER');
    const base = { initiativeId: 'TEMO-500', stageId: FEASIBILITY, approved: true, now: TEST_NOW } as const;

    await expect(setStageSignoff(store, legal, { ...base, department: 'LEGAL' })).rejects.toThrow(/Sin observaciones/);
    await setStageSignoff(store, legal, { ...base, department: 'LEGAL', noObservations: true });
    await setStageSignoff(store, makeSession('CYBER', 'LEAD'), {
      ...base,
      department: 'CYBER',
      note: 'Revisar aislamiento multitenant antes de Diseño.',
    });
    await expect(setStageSignoff(store, tech, { ...base, department: 'TECH' })).rejects.toThrow(/T-shirt/);
    const sized = await setStageSignoff(store, tech, { ...base, department: 'TECH', tshirtSize: 'M' });
    expect(sized.tshirtSize).toBe('M');

    expect((await evaluateGate(store, makeInitiative())).isComplete).toBe(true);
  });

  it('la talla no se guarda donde no se exige', async () => {
    const { store } = makeTestStore();
    const signoff = await setStageSignoff(store, makeSession('LEGAL', 'MEMBER'), {
      initiativeId: 'TEMO-500',
      stageId: FEASIBILITY,
      department: 'LEGAL',
      approved: true,
      noObservations: true,
      tshirtSize: 'XL',
      now: TEST_NOW,
    });
    expect(signoff.tshirtSize).toBeNull();
  });

  it('AC-7: retirar limpia la aprobación, audita y reabre la compuerta', async () => {
    const { store } = makeTestStore([makeInitiative({ currentStageId: STAGE_ID_BY_KEY.DEV, ownerDepartment: 'TECH' })]);
    const tech = makeSession('TECH', 'MEMBER');
    const base = { initiativeId: 'TEMO-500', stageId: STAGE_ID_BY_KEY.DEV, department: 'TECH', now: TEST_NOW } as const;
    await setStageSignoff(store, tech, { ...base, approved: true, note: 'Revisión de código completada.' });
    const revoked = await setStageSignoff(store, tech, { ...base, approved: false });
    expect(revoked).toMatchObject({ isApproved: false, approvedBy: null, approvedAt: null, note: null });

    const log = await store.listActivityLog('TEMO-500');
    expect(log.map((entry) => entry.actionType)).toContain('STAGE_SIGNOFF_REVOKED');
    // La nota no se copia al log.
    expect(JSON.stringify(log)).not.toContain('Revisión de código completada');

    const initiative = await store.initiativeById('TEMO-500');
    if (!initiative) throw new Error('iniciativa no encontrada');
    expect((await evaluateGate(store, initiative)).isComplete).toBe(false);
  });

  it('retirar una aprobación que no existe es un estado inválido', async () => {
    const { store } = makeTestStore();
    await expect(
      setStageSignoff(store, makeSession('LEGAL', 'MEMBER'), {
        initiativeId: 'TEMO-500',
        stageId: FEASIBILITY,
        department: 'LEGAL',
        approved: false,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('AC-8: no se aprueba otra fase ni un área que no aprueba la fase', async () => {
    const { store } = makeTestStore();
    const legal = makeSession('LEGAL', 'MEMBER');
    await expect(
      setStageSignoff(store, legal, {
        initiativeId: 'TEMO-500',
        stageId: STAGE_ID_BY_KEY.READY,
        department: 'LEGAL',
        approved: true,
      }),
    ).rejects.toThrow(/fase actual/);
    await expect(
      setStageSignoff(store, makeSession('DESIGN', 'MEMBER'), {
        initiativeId: 'TEMO-500',
        stageId: FEASIBILITY,
        department: 'DESIGN',
        approved: true,
      }),
    ).rejects.toThrow(/no aprueba/);
  });

  it('AC-14: no se aprueba en una iniciativa finalizada', async () => {
    const { store } = makeTestStore([
      makeInitiative({ finalizedAt: TEST_NOW.toISOString(), finalizedBy: '00000000-0000-4000-8000-000000000000' }),
    ]);
    await expect(
      setStageSignoff(store, makeSession('LEGAL', 'MEMBER'), {
        initiativeId: 'TEMO-500',
        stageId: FEASIBILITY,
        department: 'LEGAL',
        approved: true,
        noObservations: true,
      }),
    ).rejects.toThrow(/finalizada/);
  });
});

describe('casillas adicionales', () => {
  it('AC-9: no bloquean la compuerta y guardan quién las marca', async () => {
    const { store } = makeTestStore([makeInitiative({ currentStageId: STAGE_ID_BY_KEY.DEV, ownerDepartment: 'TECH' })]);
    const tech = makeSession('TECH', 'MEMBER');
    const check = await addCustomCheck(store, tech, {
      initiativeId: 'TEMO-500',
      label: 'Revisar migración de datos',
      note: 'Con el script de staging',
      now: TEST_NOW,
    });
    await setStageSignoff(store, tech, {
      initiativeId: 'TEMO-500',
      stageId: STAGE_ID_BY_KEY.DEV,
      department: 'TECH',
      approved: true,
      now: TEST_NOW,
    });
    const initiative = await store.initiativeById('TEMO-500');
    if (!initiative) throw new Error('iniciativa no encontrada');
    expect((await evaluateGate(store, initiative)).isComplete).toBe(true);

    const done = await setCustomCheckState(store, tech, { checkId: check.id, isCompleted: true, now: TEST_NOW });
    expect(done).toMatchObject({ isCompleted: true, completedBy: tech.userId });

    const removed = await removeCustomCheck(store, tech, { checkId: check.id, now: TEST_NOW });
    expect(removed).toMatchObject({ isRemoved: true, removedBy: tech.userId });
    await expect(setCustomCheckState(store, tech, { checkId: check.id, isCompleted: false })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    const actions = (await store.listActivityLog('TEMO-500')).map((entry) => entry.actionType);
    expect(actions).toEqual(expect.arrayContaining(['CUSTOM_CHECK_ADDED', 'CUSTOM_CHECK_UPDATED', 'CUSTOM_CHECK_REMOVED']));
  });

  it('un área ajena a la fase no añade casillas', async () => {
    const { store } = makeTestStore();
    await expect(
      addCustomCheck(store, makeSession('MARKETING', 'LEAD'), { initiativeId: 'TEMO-500', label: 'Plan de campaña' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('valida el enunciado y la nota', async () => {
    const { store } = makeTestStore();
    const legal = makeSession('LEGAL', 'MEMBER');
    await expect(addCustomCheck(store, legal, { initiativeId: 'TEMO-500', label: 'ab' })).rejects.toThrow(/enunciado/);
    await expect(
      addCustomCheck(store, legal, { initiativeId: 'TEMO-500', label: 'Revisión', note: 'x'.repeat(301) }),
    ).rejects.toThrow(/300/);
  });

  it('no se tocan las casillas de una fase ya cerrada', async () => {
    const { store } = makeTestStore();
    const legal = makeSession('LEGAL', 'MEMBER');
    const check = await addCustomCheck(store, legal, { initiativeId: 'TEMO-500', label: 'Revisión del contrato' });
    await store.updateInitiative('TEMO-500', { currentStageId: STAGE_ID_BY_KEY.CO_DESIGN, ownerDepartment: 'DESIGN' });
    await expect(setCustomCheckState(store, legal, { checkId: check.id, isCompleted: true })).rejects.toThrow(/fase actual/);
  });
});
