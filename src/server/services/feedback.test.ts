import { describe, expect, it } from 'vitest';
import { createFeedback, getFeedbackView, setFeedbackStatus } from './feedback';
import { TEST_NOW, makeSession, makeTestStore } from './test-utils';

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
