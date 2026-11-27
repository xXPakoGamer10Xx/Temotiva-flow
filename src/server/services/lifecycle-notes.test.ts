import { describe, expect, it } from 'vitest';
import { OVERRIDE_SIGNATURE } from '@/domain/rules';
import { STAGE_ID_BY_KEY } from '@/domain/workflow';
import { evaluateGate } from './gate';
import { advanceStage, assignInitiative, createInitiative, finalizeInitiative, updateInitiative } from './initiatives';
import { setManualStop } from './blocking';
import { TEST_ADVANCE_NOTE, TEST_NOW, completeGate, makeInitiative, makeSession, makeTestStore } from './test-utils';

/** Descripción obligatoria, nota de avance y finalización (spec 005, T-07). */

const createBase = {
  title: 'Diario emocional guiado',
  priority: 'NORMAL' as const,
  priorityReason: 'ROADMAP' as const,
  now: TEST_NOW,
};

describe('descripción obligatoria (RF-1, RF-2)', () => {
  it('AC-1: con menos de 20 caracteres no se crea; con 20 sí', async () => {
    const { store } = makeTestStore([]);
    const session = makeSession('PRODUCT', 'MEMBER');
    await expect(createInitiative(store, session, { ...createBase, description: 'Muy corta' })).rejects.toThrow(
      /descripción es obligatoria/,
    );
    await expect(createInitiative(store, session, { ...createBase, description: '   ' })).rejects.toThrow(/obligatoria/);
    const created = await createInitiative(store, session, { ...createBase, description: 'x'.repeat(20) });
    expect(created.description).toHaveLength(20);
  });

  it('una iniciativa antigua sin descripción edita otros campos; vaciarla o acortarla no', async () => {
    const { store } = makeTestStore([makeInitiative({ description: '' })]);
    const session = makeSession('LEGAL', 'MEMBER');
    const updated = await updateInitiative(store, session, {
      initiativeId: 'TEMO-500',
      title: 'Título nuevo y suficientemente largo',
      description: '',
    });
    expect(updated.title).toBe('Título nuevo y suficientemente largo');
    await expect(
      updateInitiative(store, session, { initiativeId: 'TEMO-500', description: 'corta' }),
    ).rejects.toThrow(/obligatoria/);
  });
});

describe('nota de avance (RF-3, RF-4)', () => {
  it('AC-2: sin nota suficiente no avanza; con nota avanza y la guarda con autor y fase', async () => {
    const { store } = makeTestStore();
    const session = makeSession('LEGAL', 'MEMBER');
    await completeGate(store, 'TEMO-500', 'FEASIBILITY', session.userId);

    await expect(
      advanceStage(store, session, { initiativeId: 'TEMO-500', note: 'x'.repeat(19), now: TEST_NOW }),
    ).rejects.toThrow(/qué se hizo/);
    expect((await store.initiativeById('TEMO-500'))?.currentStageId).toBe(STAGE_ID_BY_KEY.FEASIBILITY);

    const result = await advanceStage(store, session, { initiativeId: 'TEMO-500', note: TEST_ADVANCE_NOTE, now: TEST_NOW });
    expect(result.status).toBe('ADVANCED');

    const [note] = await store.listStageNotes('TEMO-500');
    expect(note).toMatchObject({
      fromStageId: STAGE_ID_BY_KEY.FEASIBILITY,
      toStageId: STAGE_ID_BY_KEY.CO_DESIGN,
      note: TEST_ADVANCE_NOTE,
      authorId: session.userId,
      authorDepartments: ['LEGAL'],
      isOverride: false,
    });
    const transition = (await store.listActivityLog('TEMO-500')).find((entry) => entry.actionType === 'STAGE_TRANSITION');
    expect(transition?.newValue).toMatchObject({ noteId: note?.id });
    // El texto no se duplica en la caja negra.
    expect(JSON.stringify(transition)).not.toContain(TEST_ADVANCE_NOTE);
  });

  it('con pendientes devuelve el panel aunque no haya nota (nunca un error pasivo)', async () => {
    const { store } = makeTestStore();
    const result = await advanceStage(store, makeSession('LEGAL', 'MEMBER'), {
      initiativeId: 'TEMO-500',
      note: '',
      now: TEST_NOW,
    });
    expect(result.status).toBe('GATE_BLOCKED');
  });

  it('AC-3: dos avances simultáneos producen un solo salto y una sola nota', async () => {
    const { store } = makeTestStore();
    const session = makeSession('LEGAL', 'MEMBER');
    await completeGate(store, 'TEMO-500', 'FEASIBILITY', session.userId);
    const input = { initiativeId: 'TEMO-500', note: TEST_ADVANCE_NOTE, now: TEST_NOW };

    const results = await Promise.allSettled([advanceStage(store, session, input), advanceStage(store, session, input)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await store.listStageNotes('TEMO-500')).toHaveLength(1);
    expect((await store.initiativeById('TEMO-500'))?.currentStageId).toBe(STAGE_ID_BY_KEY.CO_DESIGN);
    const transitions = (await store.listActivityLog('TEMO-500')).filter((entry) => entry.actionType === 'STAGE_TRANSITION');
    expect(transitions).toHaveLength(1);
  });

  it('AC-10: el override reconoce las aprobaciones pendientes y exige nota', async () => {
    const { store } = makeTestStore();
    const lead = makeSession('LEGAL', 'LEAD');
    const gate = await evaluateGate(store, makeInitiative());
    const override = {
      reason: 'El expediente debe presentarse antes del cierre de mes ante la autoridad.',
      riskAccepted: 'Asumimos posible retrabajo si el dictamen exige un alcance mayor.',
      signature: OVERRIDE_SIGNATURE,
      acknowledgedPendingIds: gate.pending.map((item) => item.id),
    };
    expect(override.acknowledgedPendingIds.every((id) => id.startsWith('SIGNOFF:FEASIBILITY:'))).toBe(true);

    await expect(
      advanceStage(store, lead, { initiativeId: 'TEMO-500', note: '', override, now: TEST_NOW }),
    ).rejects.toThrow(/qué se hizo/);
    expect(await store.listActivityLog('TEMO-500')).toHaveLength(0);

    const result = await advanceStage(store, lead, { initiativeId: 'TEMO-500', note: TEST_ADVANCE_NOTE, override, now: TEST_NOW });
    expect(result).toMatchObject({ status: 'ADVANCED', overridden: true });
    const [note] = await store.listStageNotes('TEMO-500');
    expect(note?.isOverride).toBe(true);
    const overrideEntry = (await store.listActivityLog('TEMO-500')).find((entry) => entry.actionType === 'EXCEPTION_OVERRIDE');
    expect(overrideEntry?.overrideMetadata?.pendingItems).toHaveLength(3);
  });

  it('desde Producción el avance remite a Finalizar', async () => {
    const { store } = makeTestStore([makeInitiative({ currentStageId: STAGE_ID_BY_KEY.PROD, ownerDepartment: 'TECH' })]);
    const tech = makeSession('TECH', 'MEMBER');
    await completeGate(store, 'TEMO-500', 'PROD', tech.userId);
    await expect(
      advanceStage(store, tech, { initiativeId: 'TEMO-500', note: TEST_ADVANCE_NOTE, now: TEST_NOW }),
    ).rejects.toThrow(/Finalizar iniciativa/);
  });
});

describe('finalización (RF-16, RF-17)', () => {
  const inProd = () => makeInitiative({ currentStageId: STAGE_ID_BY_KEY.PROD, ownerDepartment: 'TECH' });

  it('AC-13: sin la aprobación de Tech devuelve pendientes y no admite override', async () => {
    const { store } = makeTestStore([inProd()]);
    const result = await finalizeInitiative(store, makeSession('TECH', 'LEAD'), {
      initiativeId: 'TEMO-500',
      note: TEST_ADVANCE_NOTE,
      now: TEST_NOW,
    });
    expect(result.status).toBe('GATE_BLOCKED');
    if (result.status === 'GATE_BLOCKED') {
      expect(result.gate.pending.map((item) => item.id)).toEqual(['SIGNOFF:PROD:TECH']);
    }
    expect((await store.initiativeById('TEMO-500'))?.finalizedAt ?? null).toBeNull();
  });

  it('AC-13: con Tech aprobado y nota, finaliza, deja la nota de cierre y el evento', async () => {
    const { store } = makeTestStore([inProd()]);
    const tech = makeSession('TECH', 'MEMBER');
    await completeGate(store, 'TEMO-500', 'PROD', tech.userId);

    const result = await finalizeInitiative(store, tech, { initiativeId: 'TEMO-500', note: TEST_ADVANCE_NOTE, now: TEST_NOW });
    expect(result.status).toBe('FINALIZED');

    const initiative = await store.initiativeById('TEMO-500');
    expect(initiative).toMatchObject({
      finalizedAt: TEST_NOW.toISOString(),
      finalizedBy: tech.userId,
      currentStageId: STAGE_ID_BY_KEY.PROD,
      isArchived: false,
    });
    const [note] = await store.listStageNotes('TEMO-500');
    expect(note).toMatchObject({ fromStageId: STAGE_ID_BY_KEY.PROD, toStageId: null });
    expect((await store.listActivityLog('TEMO-500')).map((entry) => entry.actionType)).toContain('INITIATIVE_FINALIZED');
  });

  it('solo desde Producción, solo el área propietaria o Dirección, y sin parada', async () => {
    const { store } = makeTestStore([inProd(), makeInitiative({ id: 'TEMO-501' })]);
    await expect(
      finalizeInitiative(store, makeSession('LEGAL', 'MEMBER'), { initiativeId: 'TEMO-501', note: TEST_ADVANCE_NOTE }),
    ).rejects.toThrow(/Producción/);
    await expect(
      finalizeInitiative(store, makeSession('PRODUCT', 'LEAD'), { initiativeId: 'TEMO-500', note: TEST_ADVANCE_NOTE }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const tech = makeSession('TECH', 'MEMBER');
    await setManualStop(store, tech, {
      initiativeId: 'TEMO-500',
      stopReason: 'BLOQUEO_TECNICO',
      description: 'Caída del proveedor de correo',
      now: TEST_NOW,
    });
    await expect(finalizeInitiative(store, tech, { initiativeId: 'TEMO-500', note: TEST_ADVANCE_NOTE })).rejects.toThrow(
      /parada/,
    );
  });

  it('AC-14: una iniciativa finalizada es de solo lectura', async () => {
    const { store } = makeTestStore([inProd()]);
    const tech = makeSession('TECH', 'LEAD');
    await completeGate(store, 'TEMO-500', 'PROD', tech.userId);
    await finalizeInitiative(store, tech, { initiativeId: 'TEMO-500', note: TEST_ADVANCE_NOTE, now: TEST_NOW });

    await expect(finalizeInitiative(store, tech, { initiativeId: 'TEMO-500', note: TEST_ADVANCE_NOTE })).rejects.toThrow(
      /finalizada/,
    );
    await expect(updateInitiative(store, tech, { initiativeId: 'TEMO-500', title: 'Otro título bastante largo' })).rejects.toThrow(
      /finalizada/,
    );
    await expect(assignInitiative(store, tech, { initiativeId: 'TEMO-500', assigneeId: null })).rejects.toThrow(/finalizada/);
  });
});
