import { describe, expect, it } from 'vitest';
import { createDependency } from './dependencies';
import { setManualStop } from './blocking';
import { getBoardView, getMyWork } from './views';
import { STAGE_ID_BY_KEY } from '@/domain/workflow';
import { TEST_NOW, makeInitiative, makeSession, makeTestStore, makeUser, sessionOf } from './test-utils';

const ids = (items: { card: { id: string } }[]): string[] => items.map((item) => item.card.id).sort();

/**
 * "Lo que me toca": una sola definición para la vista Mi trabajo y los filtros
 * del tablero (Mías / Esperando de mí / Bloqueadas).
 */
describe('mi trabajo', () => {
  it('Mías son las asignadas a mí; las de mi área sin asignar van aparte', async () => {
    const me = makeUser({ departments: ['LEGAL'], role: 'MEMBER' });
    const { store } = makeTestStore(
      [
        makeInitiative({ id: 'TEMO-501', currentAssigneeId: me.id }),
        makeInitiative({ id: 'TEMO-502' }),
        makeInitiative({ id: 'TEMO-503', ownerDepartment: 'TECH' }),
      ],
      [me],
    );

    const view = await getMyWork(store, sessionOf(me), { now: TEST_NOW });

    expect(ids(view.mine)).toEqual(['TEMO-501']);
    expect(ids(view.unassignedInMyArea)).toEqual(['TEMO-502']);
  });

  it('Esperando de mí: solicitudes abiertas a mis áreas y requisitos de compuerta que solo marca mi área', async () => {
    const { store } = makeTestStore([
      // Viabilidad la lleva Legal; uno de sus requisitos es de Tecnología.
      makeInitiative({ id: 'TEMO-501' }),
      makeInitiative({ id: 'TEMO-502', ownerDepartment: 'PRODUCT', currentStageId: STAGE_ID_BY_KEY.IDEATION }),
    ]);
    await createDependency(store, makeSession('PRODUCT', 'MEMBER'), {
      initiativeId: 'TEMO-502',
      targetDepartment: 'DESIGN',
      helpType: 'VALIDATION',
      description: 'Revisar el microcopy de la pantalla de bienvenida.',
      isBlocking: false,
      now: TEST_NOW,
    });

    const tech = await getMyWork(store, makeSession('TECH', 'MEMBER'), { now: TEST_NOW });
    expect(ids(tech.waiting)).toEqual(['TEMO-501']);
    expect(tech.waiting[0]?.waitingReasons.every((reason: string) => reason.startsWith('Requisito de compuerta'))).toBe(true);

    const design = await getMyWork(store, makeSession('DESIGN', 'MEMBER'), { now: TEST_NOW });
    expect(ids(design.waiting)).toEqual(['TEMO-502']);
    expect(design.waiting[0]?.waitingReasons[0]).toContain('microcopy');

    // Con varias áreas, llega lo de cualquiera de ellas.
    const both = await getMyWork(store, makeSession(['TECH', 'DESIGN'], 'MEMBER'), { now: TEST_NOW });
    expect(ids(both.waiting)).toEqual(['TEMO-501', 'TEMO-502']);
  });

  it('los requisitos de compuerta de mi propia área no son "esperando de mí" sino trabajo de la iniciativa', async () => {
    const { store } = makeTestStore([makeInitiative({ id: 'TEMO-501' })]);

    const legal = await getMyWork(store, makeSession('LEGAL', 'MEMBER'), { now: TEST_NOW });

    expect(legal.waiting).toHaveLength(0);
    expect(ids(legal.unassignedInMyArea)).toEqual(['TEMO-501']);
  });

  it('Bloqueadas: paradas que son mías, de mi área o esperan una solicitud mía', async () => {
    const legalLead = makeSession('LEGAL', 'LEAD');
    const { store } = makeTestStore([
      makeInitiative({ id: 'TEMO-501' }),
      makeInitiative({ id: 'TEMO-502', ownerDepartment: 'TECH' }),
      makeInitiative({ id: 'TEMO-503', ownerDepartment: 'TECH' }),
    ]);
    await setManualStop(store, legalLead, {
      initiativeId: 'TEMO-501',
      stopReason: 'ESPERANDO_DECISION',
      description: 'Pendiente del comité de privacidad.',
      now: TEST_NOW,
    });
    await createDependency(store, legalLead, {
      initiativeId: 'TEMO-502',
      targetDepartment: 'CYBER',
      helpType: 'VALIDATION',
      description: 'Validar el cifrado del almacenamiento de audios.',
      isBlocking: true,
      now: TEST_NOW,
    });
    await setManualStop(store, makeSession('TECH', 'LEAD'), {
      initiativeId: 'TEMO-503',
      stopReason: 'ESPERANDO_DECISION',
      description: 'Sin relación con Legal.',
      now: TEST_NOW,
    });

    const view = await getMyWork(store, legalLead, { now: TEST_NOW });

    expect(ids(view.blocked)).toEqual(['TEMO-501', 'TEMO-502']);
  });

  it('las archivadas no aparecen y el filtro del tablero coincide con la vista', async () => {
    const me = makeUser({ departments: ['LEGAL'], role: 'MEMBER' });
    const { store } = makeTestStore(
      [
        makeInitiative({ id: 'TEMO-501', currentAssigneeId: me.id }),
        makeInitiative({ id: 'TEMO-502', currentAssigneeId: me.id, isArchived: true }),
        makeInitiative({ id: 'TEMO-503' }),
      ],
      [me],
    );
    const session = sessionOf(me);

    const view = await getMyWork(store, session, { now: TEST_NOW });
    expect(ids(view.mine)).toEqual(['TEMO-501']);

    const board = await getBoardView(store, { now: TEST_NOW, session, filter: { view: 'mias' } });
    expect(board.flatMap((column) => column.cards.map((card) => card.id))).toEqual(['TEMO-501']);
  });
});
