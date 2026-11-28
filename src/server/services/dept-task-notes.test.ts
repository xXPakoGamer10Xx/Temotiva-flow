import { describe, expect, it } from 'vitest';
import type { DeptTask } from '@/domain/types';
import { MAX_TASK_NOTE, MAX_TASK_NOTES_PER_TASK } from '@/domain/rules';
import { taskNoteSignal } from '@/domain/task-note';
import { anonymizeUser, setAccessActive } from './access';
import { TASK_NOTE_CONFLICT_ERROR, addTaskNote, editTaskNote, listTaskNoteRevisions, removeTaskNote } from './dept-task-notes';
import { createDeptTask, getTasksView, moveDeptTask, removeDeptTask } from './dept-tasks';
import { getTechSprintView } from './tech-sprint';
import { TEST_NOW, makeInitiative, makeTestStore, makeUser, sessionOf } from './test-utils';

/**
 * Notas de seguimiento de las tareas de área (spec 006, T-05).
 * Sesiones: MEMBER autora (Ana), otro MEMBER del área (Luis), LEAD del área,
 * EXECUTIVE de otra área y MEMBER ajeno (Legal).
 */

const at = (minutes: number): Date => new Date(TEST_NOW.getTime() + minutes * 60 * 1000);

function setup() {
  const lead = makeUser({ name: 'Lola Lead', departments: ['TECH'], role: 'LEAD' });
  const ana = makeUser({ name: 'Ana Analista', departments: ['TECH'], role: 'MEMBER' });
  const luis = makeUser({ name: 'Luis Libre', departments: ['TECH'], role: 'MEMBER' });
  const outsider = makeUser({ departments: ['LEGAL'], role: 'MEMBER' });
  const boss = makeUser({ name: 'Berta Boss', departments: ['PRODUCT'], role: 'EXECUTIVE' });
  const ctx = makeTestStore([makeInitiative()], [lead, ana, luis, outsider, boss]);
  return { ...ctx, lead, ana, luis, outsider, boss };
}
type Setup = ReturnType<typeof setup>;

async function doingTask(s: Setup, initiativeId: string | null = null): Promise<DeptTask> {
  const task = await createDeptTask(s.store, sessionOf(s.lead), {
    title: 'Integrar la API de citas',
    department: 'TECH',
    initiativeId,
    now: TEST_NOW,
  });
  await moveDeptTask(s.store, sessionOf(s.ana), { taskId: task.id, status: 'DOING', now: TEST_NOW });
  return (await s.store.deptTaskById(task.id))!;
}

const noteEvents = async (s: Setup) =>
  (await s.store.listActivityLog()).filter((entry) => entry.actionType.startsWith('TASK_NOTE_'));

describe('añadir notas (RF-1…RF-4)', () => {
  it('un MEMBER del área añade una espera con autor, área y hora del servidor (AC-1)', async () => {
    const s = setup();
    const task = await doingTask(s);
    const note = await addTaskNote(s.store, sessionOf(s.ana), {
      taskId: task.id,
      kind: 'WAITING',
      body: '  Esperando credenciales del proveedor.  ',
      now: at(5),
    });
    expect(note).toMatchObject({
      taskId: task.id,
      kind: 'WAITING',
      body: 'Esperando credenciales del proveedor.',
      authorId: s.ana.id,
      authorDepartment: 'TECH',
      createdAt: at(5).toISOString(),
      version: 1,
    });
    expect(taskNoteSignal(await s.store.listDeptTaskNotes(task.id))).toBe('WAITING');
  });

  it('otra persona añade una novedad: las dos se conservan y la señal se despeja (AC-2)', async () => {
    const s = setup();
    const task = await doingTask(s);
    await addTaskNote(s.store, sessionOf(s.ana), { taskId: task.id, kind: 'WAITING', body: 'Esperando a Legal.', now: at(1) });
    await addTaskNote(s.store, sessionOf(s.luis), { taskId: task.id, kind: 'UPDATE', body: 'Legal ya respondió.', now: at(2) });
    const notes = await s.store.listDeptTaskNotes(task.id);
    expect(notes.map((n) => n.body)).toEqual(['Esperando a Legal.', 'Legal ya respondió.']);
    expect(taskNoteSignal(notes)).toBeNull();
  });

  it('Dirección de fuera del área escribe como «Dirección» (área nula)', async () => {
    const s = setup();
    const task = await doingTask(s);
    const note = await addTaskNote(s.store, sessionOf(s.boss), { taskId: task.id, kind: 'BLOCKED', body: 'Parado por presupuesto.' });
    expect(note.authorDepartment).toBeNull();
  });

  it('un MEMBER de otra área no ve la tarea: responde «no existe» (AC-3)', async () => {
    const s = setup();
    const task = await doingTask(s);
    await expect(
      addTaskNote(s.store, sessionOf(s.outsider), { taskId: task.id, kind: 'UPDATE', body: 'Intento ajeno.' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rechaza textos fuera de límites, tareas hechas y archivadas (AC-8)', async () => {
    const s = setup();
    const task = await doingTask(s);
    const session = sessionOf(s.ana);
    await expect(addTaskNote(s.store, session, { taskId: task.id, kind: 'UPDATE', body: 'ok' })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(
      addTaskNote(s.store, session, { taskId: task.id, kind: 'UPDATE', body: 'a'.repeat(MAX_TASK_NOTE + 1) }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    await moveDeptTask(s.store, session, { taskId: task.id, status: 'DONE' });
    await expect(addTaskNote(s.store, session, { taskId: task.id, kind: 'UPDATE', body: 'Ya está hecha.' })).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });

    const other = await doingTask(s);
    await removeDeptTask(s.store, sessionOf(s.lead), { taskId: other.id });
    await expect(addTaskNote(s.store, session, { taskId: other.id, kind: 'UPDATE', body: 'Retirada.' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('admite notas en «Por hacer» y «En revisión» (P-3)', async () => {
    const s = setup();
    const todo = await createDeptTask(s.store, sessionOf(s.lead), { title: 'Preparar entorno', department: 'TECH' });
    await expect(addTaskNote(s.store, sessionOf(s.ana), { taskId: todo.id, kind: 'WAITING', body: 'Sin acceso aún.' })).resolves.toBeTruthy();
    await moveDeptTask(s.store, sessionOf(s.ana), { taskId: todo.id, status: 'REVIEW' });
    await expect(addTaskNote(s.store, sessionOf(s.ana), { taskId: todo.id, kind: 'UPDATE', body: 'En revisión.' })).resolves.toBeTruthy();
  });

  it('aplica el tope de notas vigentes por tarea (RF-4)', async () => {
    const s = setup();
    const task = await doingTask(s);
    for (let i = 0; i < MAX_TASK_NOTES_PER_TASK; i++) {
      await s.store.insertDeptTaskNote({
        id: `n-${i}`,
        taskId: task.id,
        kind: 'UPDATE',
        body: `Nota ${i}`,
        authorId: s.ana.id,
        authorDepartment: 'TECH',
        createdAt: at(i).toISOString(),
        version: 1,
        editedAt: null,
        editedBy: null,
        isRemoved: false,
        removedBy: null,
        removedAt: null,
      });
    }
    await expect(addTaskNote(s.store, sessionOf(s.ana), { taskId: task.id, kind: 'UPDATE', body: 'Una más.' })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await removeTaskNote(s.store, sessionOf(s.ana), { noteId: 'n-0' });
    await expect(addTaskNote(s.store, sessionOf(s.ana), { taskId: task.id, kind: 'UPDATE', body: 'Ahora sí.' })).resolves.toBeTruthy();
  });
});

describe('editar y retirar (RF-5…RF-8)', () => {
  async function withNote(s: Setup) {
    const task = await doingTask(s);
    const note = await addTaskNote(s.store, sessionOf(s.ana), { taskId: task.id, kind: 'WAITING', body: 'Esperando a Legal.', now: at(1) });
    return { task, note };
  }

  it('la autora edita: queda editada y se guarda la versión anterior (AC-4)', async () => {
    const s = setup();
    const { note } = await withNote(s);
    const edited = await editTaskNote(s.store, sessionOf(s.ana), {
      noteId: note.id,
      expectedVersion: 1,
      kind: 'BLOCKED',
      body: 'Legal pide más datos.',
      now: at(10),
    });
    expect(edited).toMatchObject({ kind: 'BLOCKED', body: 'Legal pide más datos.', version: 2, editedBy: s.ana.id });
    expect(await listTaskNoteRevisions(s.store, sessionOf(s.luis), note.id)).toEqual([
      { version: 1, kind: 'WAITING', body: 'Esperando a Legal.', replacedAt: at(10).toISOString(), replacedByName: 'Ana Analista' },
    ]);
  });

  it('otro MEMBER o el LEAD no editan ni retiran una nota ajena (AC-5)', async () => {
    const s = setup();
    const { note } = await withNote(s);
    for (const user of [s.luis, s.lead]) {
      await expect(
        editTaskNote(s.store, sessionOf(user), { noteId: note.id, expectedVersion: 1, kind: 'UPDATE', body: 'Cambio ajeno.' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(removeTaskNote(s.store, sessionOf(user), { noteId: note.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    await expect(removeTaskNote(s.store, sessionOf(s.outsider), { noteId: note.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('Dirección edita y retira cualquier nota; la retirada es lógica y la señal se recalcula (AC-6)', async () => {
    const s = setup();
    const { task, note } = await withNote(s);
    await editTaskNote(s.store, sessionOf(s.boss), { noteId: note.id, expectedVersion: 1, kind: 'WAITING', body: 'Corrección de Dirección.' });
    await removeTaskNote(s.store, sessionOf(s.boss), { noteId: note.id });
    const stored = await s.store.deptTaskNoteById(note.id);
    expect(stored).toMatchObject({ isRemoved: true, removedBy: s.boss.id });
    expect(taskNoteSignal(await s.store.listDeptTaskNotes(task.id))).toBeNull();
    await expect(removeTaskNote(s.store, sessionOf(s.boss), { noteId: note.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('dos ediciones con la misma versión: solo gana una (AC-7)', async () => {
    const s = setup();
    const { note } = await withNote(s);
    const edit = (body: string) =>
      editTaskNote(s.store, sessionOf(s.ana), { noteId: note.id, expectedVersion: 1, kind: 'UPDATE', body });
    const results = await Promise.allSettled([edit('Primera versión.'), edit('Segunda versión.')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'INVALID_STATE', message: TASK_NOTE_CONFLICT_ERROR });
    expect(await s.store.listDeptTaskNoteRevisions(note.id)).toHaveLength(1);
  });

  it('una edición sin cambios no escribe ni audita', async () => {
    const s = setup();
    const { note } = await withNote(s);
    await editTaskNote(s.store, sessionOf(s.ana), { noteId: note.id, expectedVersion: 1, kind: 'WAITING', body: ' Esperando a Legal. ' });
    expect(await s.store.deptTaskNoteById(note.id)).toMatchObject({ version: 1, editedAt: null });
    expect((await noteEvents(s)).map((e) => e.actionType)).toEqual(['TASK_NOTE_ADDED']);
  });

  it('en una tarea hecha las notas son de solo lectura', async () => {
    const s = setup();
    const { task, note } = await withNote(s);
    await moveDeptTask(s.store, sessionOf(s.ana), { taskId: task.id, status: 'DONE' });
    await expect(
      editTaskNote(s.store, sessionOf(s.ana), { noteId: note.id, expectedVersion: 1, kind: 'UPDATE', body: 'Tarde.' }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(removeTaskNote(s.store, sessionOf(s.ana), { noteId: note.id })).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});

describe('auditoría, iniciativa y anonimización', () => {
  it('audita los tres eventos sin el texto de la nota (RF-9)', async () => {
    const s = setup();
    const task = await doingTask(s, 'TEMO-500');
    const note = await addTaskNote(s.store, sessionOf(s.ana), { taskId: task.id, kind: 'WAITING', body: 'Texto confidencial.' });
    await editTaskNote(s.store, sessionOf(s.ana), { noteId: note.id, expectedVersion: 1, kind: 'UPDATE', body: 'Otro texto confidencial.' });
    await removeTaskNote(s.store, sessionOf(s.ana), { noteId: note.id });

    const events = await noteEvents(s);
    expect(events.map((e) => e.actionType)).toEqual(['TASK_NOTE_ADDED', 'TASK_NOTE_EDITED', 'TASK_NOTE_REMOVED']);
    for (const event of events) {
      expect(event).toMatchObject({ userId: s.ana.id, initiativeId: 'TEMO-500' });
      expect(JSON.stringify(event)).not.toContain('confidencial');
    }
    expect(events[0]?.newValue).toEqual({ taskId: task.id, noteId: note.id, kind: 'WAITING', length: 19 });
  });

  it('una nota de bloqueo no toca el bloqueo ni el SLE de la iniciativa (AC-15)', async () => {
    const s = setup();
    const before = await s.store.initiativeById('TEMO-500');
    const task = await doingTask(s, 'TEMO-500');
    await addTaskNote(s.store, sessionOf(s.ana), { taskId: task.id, kind: 'BLOCKED', body: 'Bloqueada por un tercero.' });
    expect(await s.store.initiativeById('TEMO-500')).toEqual(before);
  });

  it('al anonimizar a la autora sus notas siguen visibles con el nombre opaco (AC-14)', async () => {
    const s = setup();
    const task = await doingTask(s);
    await addTaskNote(s.store, sessionOf(s.ana), { taskId: task.id, kind: 'UPDATE', body: 'Avance del lunes.' });
    await setAccessActive(s.store, sessionOf(s.boss), { userId: s.ana.id, isActive: false });
    await anonymizeUser(s.store, sessionOf(s.boss), { userId: s.ana.id, reason: 'Solicitud de supresión RGPD.' });

    const view = await getTasksView(s.store, sessionOf(s.luis));
    const projected = view.tasks.find((t) => t.id === task.id);
    expect(projected?.notes).toHaveLength(1);
    expect(projected?.notes[0]?.authorName).toMatch(/^Persona anonimizada /);
    expect(projected?.notes[0]?.body).toBe('Avance del lunes.');
  });
});

describe('proyección en el tablero (T-07)', () => {
  it('solo proyecta notas vigentes, recientes primero, con permisos por nota', async () => {
    const s = setup();
    const task = await doingTask(s);
    const first = await addTaskNote(s.store, sessionOf(s.ana), { taskId: task.id, kind: 'WAITING', body: 'Esperando a Legal.', now: at(1) });
    await addTaskNote(s.store, sessionOf(s.luis), { taskId: task.id, kind: 'BLOCKED', body: 'Retirada después.', now: at(2) });
    const second = (await s.store.listDeptTaskNotes(task.id))[1]!;
    await removeTaskNote(s.store, sessionOf(s.luis), { noteId: second.id });

    const view = (await getTasksView(s.store, sessionOf(s.ana))).tasks.find((t) => t.id === task.id)!;
    expect(view.notes.map((n) => n.id)).toEqual([first.id]);
    expect(view).toMatchObject({ noteSignal: 'WAITING', noteCount: 1, canAddNote: true });
    expect(view.notes[0]).toMatchObject({ authorName: 'Ana Analista', authorDepartmentLabel: 'Tech', isMine: true, canEdit: true });

    const forLuis = (await getTasksView(s.store, sessionOf(s.luis))).tasks.find((t) => t.id === task.id)!;
    expect(forLuis.notes[0]).toMatchObject({ isMine: false, canEdit: false, canRemove: false });
  });

  it('una tarea ajena no llega a la vista, ni sus notas (AC-3)', async () => {
    const s = setup();
    const task = await doingTask(s);
    await addTaskNote(s.store, sessionOf(s.ana), { taskId: task.id, kind: 'UPDATE', body: 'Solo para Tech.' });
    const view = await getTasksView(s.store, sessionOf(s.outsider));
    expect(view.tasks.find((t) => t.id === task.id)).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain('Solo para Tech.');
  });

  it('marca «Nueva» solo la nota ajena reciente, nunca la propia', async () => {
    const s = setup();
    const task = await doingTask(s);
    await addTaskNote(s.store, sessionOf(s.ana), { taskId: task.id, kind: 'UPDATE', body: 'Novedad de Ana.' });
    const mine = (await getTasksView(s.store, sessionOf(s.ana))).tasks.find((t) => t.id === task.id)!;
    const theirs = (await getTasksView(s.store, sessionOf(s.luis))).tasks.find((t) => t.id === task.id)!;
    expect(mine.hasRecentNote).toBe(false);
    expect(theirs.hasRecentNote).toBe(true);
  });

  it('en una tarea hecha nadie puede añadir, editar ni retirar desde la vista', async () => {
    const s = setup();
    const task = await doingTask(s);
    await addTaskNote(s.store, sessionOf(s.ana), { taskId: task.id, kind: 'UPDATE', body: 'Casi lista.' });
    await moveDeptTask(s.store, sessionOf(s.ana), { taskId: task.id, status: 'DONE' });
    const view = (await getTasksView(s.store, sessionOf(s.boss))).tasks.find((t) => t.id === task.id)!;
    expect(view.canAddNote).toBe(false);
    expect(view.notes[0]).toMatchObject({ canEdit: false, canRemove: false });
  });

  it('una tarea hecha cuya última nota era un bloqueo no muestra la señal, pero conserva sus notas', async () => {
    const s = setup();
    const task = await doingTask(s);
    await addTaskNote(s.store, sessionOf(s.ana), { taskId: task.id, kind: 'BLOCKED', body: 'Sin acceso al entorno.', now: at(1) });
    await moveDeptTask(s.store, sessionOf(s.ana), { taskId: task.id, status: 'DONE' });

    const view = (await getTasksView(s.store, sessionOf(s.luis))).tasks.find((t) => t.id === task.id)!;
    expect(view).toMatchObject({ status: 'DONE', noteSignal: null, noteCount: 1 });
    expect(view.notes[0]).toMatchObject({ kind: 'BLOCKED', body: 'Sin acceso al entorno.' });

    // Si se reabre, la señal vuelve: se deriva de las notas, nunca se guarda.
    await moveDeptTask(s.store, sessionOf(s.ana), { taskId: task.id, status: 'REVIEW' });
    const reopened = (await getTasksView(s.store, sessionOf(s.luis))).tasks.find((t) => t.id === task.id)!;
    expect(reopened.noteSignal).toBe('BLOCKED');
  });

  it('el tablero de /tech también proyecta las notas (backlog)', async () => {
    const s = setup();
    const task = await doingTask(s);
    await addTaskNote(s.store, sessionOf(s.ana), { taskId: task.id, kind: 'BLOCKED', body: 'Falta el entorno de pruebas.' });
    const view = await getTechSprintView(s.store, sessionOf(s.luis), { today: '2026-11-27', githubConfigured: false });
    expect(view.backlog.find((t) => t.id === task.id)).toMatchObject({ noteSignal: 'BLOCKED', noteCount: 1, canAddNote: true });
  });
});
