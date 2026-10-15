import { describe, expect, it } from 'vitest';
import { addFeedbackImage, createFeedback, getFeedbackView, setFeedbackStatus } from './feedback';
import { TEST_NOW, makeInitiative, makeSession, makeTestStore, makeUser, sessionOf } from './test-utils';

describe('feedback', () => {
  it('cualquier miembro envía feedback y nace pendiente', async () => {
    const { store } = makeTestStore();
    const item = await createFeedback(store, makeSession('DESIGN', 'MEMBER'), {
      category: 'WEB',
      message: 'El tablero tarda en cargar en el móvil.',
      now: TEST_NOW,
    });

    expect(item.status).toBe('PENDING');
    expect(item.category).toBe('WEB');
    const log = await store.listActivityLog();
    expect(log.map((entry) => entry.actionType)).toContain('FEEDBACK_CREATED');
  });

  it('rechaza mensajes demasiado cortos y categorías inválidas', async () => {
    const { store } = makeTestStore();
    const session = makeSession('DESIGN', 'MEMBER');
    await expect(createFeedback(store, session, { category: 'APP', message: 'corto' })).rejects.toThrow(/mínimo/);
    await expect(
      createFeedback(store, session, { category: 'OTRA' as never, message: 'Mensaje suficientemente largo' }),
    ).rejects.toThrow(/app, la web o la plataforma/);
  });

  it('un miembro no puede cambiar el estado', async () => {
    const { store } = makeTestStore();
    const member = makeSession('DESIGN', 'MEMBER');
    const item = await createFeedback(store, member, { category: 'APP', message: 'Falta un modo oscuro en la app.' });

    await expect(setFeedbackStatus(store, member, { feedbackId: item.id, status: 'DONE' })).rejects.toThrow(
      /Solo los responsables/,
    );
    expect((await store.feedbackById(item.id))?.status).toBe('PENDING');
  });

  it('responsables de área y Dirección sí lo cambian y queda auditado', async () => {
    const { store } = makeTestStore();
    const item = await createFeedback(store, makeSession('DESIGN', 'MEMBER'), {
      category: 'PLATFORM',
      message: 'La plataforma debería avisar por correo.',
    });

    await setFeedbackStatus(store, makeSession('LEGAL', 'LEAD'), { feedbackId: item.id, status: 'IN_PROGRESS', now: TEST_NOW });
    expect((await store.feedbackById(item.id))?.status).toBe('IN_PROGRESS');
    await setFeedbackStatus(store, makeSession('PRODUCT', 'EXECUTIVE'), { feedbackId: item.id, status: 'DONE', now: TEST_NOW });
    expect((await store.feedbackById(item.id))?.status).toBe('DONE');

    const changes = (await store.listActivityLog()).filter((entry) => entry.actionType === 'FEEDBACK_STATUS_CHANGED');
    expect(changes).toHaveLength(2);
  });

  it('la vista lista el feedback más reciente primero', async () => {
    const { store } = makeTestStore();
    const session = makeSession('DESIGN', 'MEMBER');
    await createFeedback(store, session, { category: 'APP', message: 'Primer comentario de prueba', now: new Date('2026-09-20T10:00:00Z') });
    await createFeedback(store, session, { category: 'WEB', message: 'Segundo comentario de prueba', now: new Date('2026-09-21T10:00:00Z') });

    const view = await getFeedbackView(store);
    expect(view.map((item) => item.categoryLabel)).toEqual(['Web', 'App']);
  });
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const noopPut = async (): Promise<void> => undefined;

describe('imágenes de feedback', () => {
  it('quien envía el feedback adjunta imágenes y la vista muestra su nombre y áreas', async () => {
    const user = makeUser({ name: 'Ana Pérez', departments: ['DESIGN', 'QA'] });
    const { store } = makeTestStore([makeInitiative()], [user]);
    const author = sessionOf(user);
    const item = await createFeedback(store, author, { category: 'WEB', message: 'La vista móvil se corta a la derecha.' });
    const keys: string[] = [];

    const image = await addFeedbackImage(store, author, async (key) => void keys.push(key), {
      feedbackId: item.id,
      fileName: 'captura.png',
      bytes: PNG,
    });

    expect(image.contentType).toBe('image/png');
    expect(keys[0]).toMatch(new RegExp(`^feedback/${item.id}/`));
    const view = (await getFeedbackView(store)).find((entry) => entry.id === item.id);
    expect(view?.images).toHaveLength(1);
    expect(view?.authorName).toBe('Ana Pérez');
    expect(view?.authorAreas).toEqual(['Diseño', 'QA']);
  });

  it('rechaza lo que no es imagen por sus bytes aunque se llame .png', async () => {
    const { store } = makeTestStore();
    const author = makeSession('DESIGN', 'MEMBER');
    const item = await createFeedback(store, author, { category: 'APP', message: 'Hay un error al guardar en la app.' });
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

    await expect(
      addFeedbackImage(store, author, noopPut, { feedbackId: item.id, fileName: 'x.png', bytes: svg }),
    ).rejects.toThrow(/PNG, JPG, WebP o GIF/);
  });

  it('otra persona no añade imágenes a un feedback ajeno y hay un máximo de 3', async () => {
    const { store } = makeTestStore();
    const author = makeSession('DESIGN', 'MEMBER');
    const item = await createFeedback(store, author, { category: 'APP', message: 'Hay un error al guardar en la app.' });

    await expect(
      addFeedbackImage(store, makeSession('QA', 'EXECUTIVE'), noopPut, { feedbackId: item.id, fileName: 'a.png', bytes: PNG }),
    ).rejects.toThrow(/Solo quien envió/);

    for (let i = 0; i < 3; i += 1) {
      await addFeedbackImage(store, author, noopPut, { feedbackId: item.id, fileName: `a${i}.png`, bytes: PNG });
    }
    await expect(
      addFeedbackImage(store, author, noopPut, { feedbackId: item.id, fileName: 'extra.png', bytes: PNG }),
    ).rejects.toThrow(/Máximo/);
  });
});
