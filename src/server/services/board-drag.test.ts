import { describe, expect, it } from 'vitest';
import type { SessionContext } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { getBoardView } from './views';
import { TEST_NOW, makeInitiative, makeSession, makeTestStore } from './test-utils';

const targetOf = async (store: DataStore, session: SessionContext) => {
  const columns = await getBoardView(store, { now: TEST_NOW, session });
  return columns.flatMap((column) => column.cards).find((card) => card.id === 'TEMO-500')?.dragTargetStageId;
};

describe('arrastrar en el tablero', () => {
  it('el área propietaria puede arrastrar a la fase siguiente (Viabilidad → Co-diseño)', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);
    expect(await targetOf(store, makeSession('LEGAL', 'MEMBER'))).toBe(3);
  });

  it('otra área no puede arrastrarla', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);
    expect(await targetOf(store, makeSession('DESIGN', 'MEMBER'))).toBeNull();
  });

  it('Dirección sí, y una fase "No aplica" se salta', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL', skippedStageIds: [3] })]);
    expect(await targetOf(store, makeSession('PRODUCT', 'EXECUTIVE'))).toBe(4);
  });

  it('una iniciativa archivada no se arrastra', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL', isArchived: true })]);
    const columns = await getBoardView(store, { now: TEST_NOW, includeArchived: true, session: makeSession('LEGAL', 'LEAD') });
    const card = columns.flatMap((column) => column.cards).find((item) => item.id === 'TEMO-500');
    expect(card?.dragTargetStageId).toBeNull();
  });
});
