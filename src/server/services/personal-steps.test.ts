import { describe, expect, it } from 'vitest';
import { advanceStage } from './initiatives';
import {
  addPersonalStep,
  listMyPersonalSteps,
  removePersonalStep,
  setPersonalStepDone,
} from './personal-steps';
import { TEST_NOW, completeGate, makeInitiative, makeSession, makeTestStore } from './test-utils';

describe('pasos propios en la ruta', () => {
  it('cualquiera añade un paso propio y solo lo ve quien lo creó', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);
    const ana = makeSession('DESIGN', 'MEMBER');
    const luis = makeSession('TECH', 'MEMBER');

    await addPersonalStep(store, ana, { initiativeId: 'TEMO-500', afterStageId: 2, title: 'Preparar mockups', now: TEST_NOW });

    expect(await listMyPersonalSteps(store, ana, 'TEMO-500')).toHaveLength(1);
    expect(await listMyPersonalSteps(store, luis, 'TEMO-500')).toHaveLength(0);
  });

  it('nadie marca ni borra el paso de otra persona', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);
    const ana = makeSession('DESIGN', 'MEMBER');
    const intruder = makeSession('PRODUCT', 'EXECUTIVE');
    const step = await addPersonalStep(store, ana, { initiativeId: 'TEMO-500', afterStageId: 2, title: 'Preparar mockups' });

    await expect(setPersonalStepDone(store, intruder, { stepId: step.id, isDone: true })).rejects.toThrow(/no existe/);
    await expect(removePersonalStep(store, intruder, { stepId: step.id })).rejects.toThrow(/no existe/);

    const done = await setPersonalStepDone(store, ana, { stepId: step.id, isDone: true });
    expect(done.isDone).toBe(true);
    await removePersonalStep(store, ana, { stepId: step.id });
    expect(await listMyPersonalSteps(store, ana, 'TEMO-500')).toHaveLength(0);
  });

  it('valida el nombre, la fase y el máximo', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);
    const ana = makeSession('DESIGN', 'MEMBER');
    await expect(addPersonalStep(store, ana, { initiativeId: 'TEMO-500', afterStageId: 2, title: ' ' })).rejects.toThrow(/nombre/);
    await expect(addPersonalStep(store, ana, { initiativeId: 'TEMO-500', afterStageId: 999, title: 'Paso válido' })).rejects.toThrow(/fase/);
    for (let i = 0; i < 20; i += 1) {
      await addPersonalStep(store, ana, { initiativeId: 'TEMO-500', afterStageId: 2, title: `Paso ${i}` });
    }
    await expect(addPersonalStep(store, ana, { initiativeId: 'TEMO-500', afterStageId: 2, title: 'Uno más' })).rejects.toThrow(/Máximo/);
  });

  it('no altera la compuerta ni la ruta oficial: la fase avanza igual', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);
    const lead = makeSession('LEGAL', 'LEAD');
    await addPersonalStep(store, lead, { initiativeId: 'TEMO-500', afterStageId: 2, title: 'Nota privada' });
    await completeGate(store, 'TEMO-500', 'FEASIBILITY', lead.userId);

    const result = await advanceStage(store, lead, { initiativeId: 'TEMO-500', now: TEST_NOW });
    expect(result.status).toBe('ADVANCED');
  });
});
