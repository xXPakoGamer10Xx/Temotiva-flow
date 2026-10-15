import { describe, expect, it } from 'vitest';
import { createDependency } from './dependencies';
import { setOwnNotifications, setTeamNotifications } from './notification-settings';
import { TEST_NOW, makeSession, makeTestStore } from './test-utils';
import { getNotifications } from './views';

async function storeWithRequestToLegal() {
  const { store } = makeTestStore();
  await createDependency(store, makeSession('LEGAL', 'MEMBER'), {
    initiativeId: 'TEMO-500',
    targetDepartment: 'DESIGN',
    helpType: 'INFORMATION',
    description: 'Necesitamos el criterio de diseño sobre el flujo de consentimiento.',
    isBlocking: false,
    now: TEST_NOW,
  });
  return store;
}

type TestStore = Awaited<ReturnType<typeof storeWithRequestToLegal>>;
const lead = makeSession('DESIGN', 'LEAD');
const member = makeSession('DESIGN', 'MEMBER');
const countFor = async (store: TestStore, who: typeof lead): Promise<number> =>
  (await getNotifications(store, who)).received.length;

describe('preferencias de notificación', () => {
  it('por defecto llegan a todo el equipo del área, jefe incluido', async () => {
    const store = await storeWithRequestToLegal();
    expect(await countFor(store, member)).toBe(1);
    expect(await countFor(store, lead)).toBe(1);
  });

  it('el jefe puede dejar de recibir las suyas sin afectar al equipo', async () => {
    const store = await storeWithRequestToLegal();
    await setOwnNotifications(store, lead, { enabled: false, now: TEST_NOW });
    expect(await countFor(store, lead)).toBe(0);
    expect(await countFor(store, member)).toBe(1);
  });

  it('el jefe puede cortar las notificaciones del equipo de su área y él sigue recibiéndolas', async () => {
    const store = await storeWithRequestToLegal();
    await setTeamNotifications(store, lead, { department: 'DESIGN', enabled: false, now: TEST_NOW });
    expect(await countFor(store, member)).toBe(0);
    expect(await countFor(store, lead)).toBe(1);
  });

  it('el ajuste de un área no afecta a otra', async () => {
    const store = await storeWithRequestToLegal();
    await setTeamNotifications(store, makeSession('LEGAL', 'LEAD'), { department: 'LEGAL', enabled: false, now: TEST_NOW });
    expect(await countFor(store, member)).toBe(1);
  });

  it('solo el jefe del área (o Dirección) cambia las del equipo', async () => {
    const { store } = makeTestStore();
    await expect(
      setTeamNotifications(store, makeSession('LEGAL', 'LEAD'), { department: 'DESIGN', enabled: false }),
    ).rejects.toThrow(/Solo el responsable/);
    await expect(
      setTeamNotifications(store, makeSession('DESIGN', 'MEMBER'), { department: 'DESIGN', enabled: false }),
    ).rejects.toThrow(/Solo el responsable/);
    await setTeamNotifications(store, makeSession('PRODUCT', 'EXECUTIVE'), { department: 'DESIGN', enabled: false });
  });

  it('un miembro no elige sus propias notificaciones y los cambios quedan auditados', async () => {
    const { store } = makeTestStore();
    await expect(setOwnNotifications(store, makeSession('DESIGN', 'MEMBER'), { enabled: false })).rejects.toThrow(
      /Solo los responsables/,
    );
    await setOwnNotifications(store, makeSession('DESIGN', 'LEAD'), { enabled: false, now: TEST_NOW });
    const log = await store.listActivityLog();
    expect(log.filter((entry) => entry.actionType === 'NOTIFICATION_SETTINGS_CHANGED')).toHaveLength(1);
  });
});
