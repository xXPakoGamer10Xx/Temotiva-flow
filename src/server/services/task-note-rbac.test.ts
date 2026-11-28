import { describe, expect, it } from 'vitest';
import type { TaskStatus } from '@/domain/enums';
import type { DeptTaskNote } from '@/domain/task-note';
import type { DeptTask } from '@/domain/types';
import { canAddTaskNote, canEditTaskNote, canRemoveTaskNote } from './rbac';
import { makeSession } from './test-utils';

/** Matriz de permisos de las notas de seguimiento (spec 006, T-04). */

function task(overrides: Partial<DeptTask> = {}): DeptTask {
  return {
    id: 't-1',
    title: 'Revisar política',
    description: '',
    department: 'TECH',
    status: 'DOING',
    assigneeId: null,
    initiativeId: null,
    dueDate: null,
    createdBy: 'u-lead',
    createdAt: '2026-11-27T10:00:00.000Z',
    updatedAt: '2026-11-27T10:00:00.000Z',
    isArchived: false,
    code: null,
    estimatedHours: null,
    sprintId: null,
    pullRequest: null,
    ...overrides,
  };
}

const techMember = makeSession('TECH', 'MEMBER');
const techLead = makeSession('TECH', 'LEAD');
const legalMember = makeSession('LEGAL', 'MEMBER');
const legalLead = makeSession('LEGAL', 'LEAD');
const executive = makeSession('PRODUCT', 'EXECUTIVE');
const techAndCyber = makeSession(['CYBER', 'TECH'], 'MEMBER');

function noteBy(authorId: string): DeptTaskNote {
  return {
    id: 'n-1',
    taskId: 't-1',
    kind: 'UPDATE',
    body: 'Seguimiento',
    authorId,
    authorDepartment: 'TECH',
    createdAt: '2026-11-27T10:00:00.000Z',
    version: 1,
    editedAt: null,
    editedBy: null,
    isRemoved: false,
    removedBy: null,
    removedAt: null,
  };
}

describe('canAddTaskNote (RF-1, P-3)', () => {
  it.each([
    ['MEMBER del área', techMember, true],
    ['LEAD del área', techLead, true],
    ['persona con dos áreas (Ciber + Tech)', techAndCyber, true],
    ['EXECUTIVE de otra área', executive, true],
    ['MEMBER de otra área', legalMember, false],
    ['LEAD de otra área', legalLead, false],
  ])('%s → %s', (_label, session, expected) => {
    expect(canAddTaskNote(session, task())).toBe(expected);
  });

  it.each<[TaskStatus, boolean]>([
    ['TODO', true],
    ['DOING', true],
    ['REVIEW', true],
    ['DONE', false],
  ])('estado %s → %s', (status, expected) => {
    expect(canAddTaskNote(techMember, task({ status }))).toBe(expected);
    expect(canAddTaskNote(executive, task({ status }))).toBe(expected);
  });

  it('nadie añade notas a una tarea archivada', () => {
    expect(canAddTaskNote(executive, task({ isArchived: true }))).toBe(false);
    expect(canAddTaskNote(techMember, task({ isArchived: true }))).toBe(false);
  });
});

describe('canEditTaskNote / canRemoveTaskNote (RF-5, RF-6, P-1)', () => {
  it('el autor puede, sea cual sea su rol', () => {
    expect(canEditTaskNote(techMember, noteBy(techMember.userId))).toBe(true);
    expect(canRemoveTaskNote(techMember, noteBy(techMember.userId))).toBe(true);
  });

  it('EXECUTIVE puede sobre cualquier nota', () => {
    expect(canEditTaskNote(executive, noteBy('someone-else'))).toBe(true);
    expect(canRemoveTaskNote(executive, noteBy('someone-else'))).toBe(true);
  });

  it.each([
    ['otro MEMBER del área', techMember],
    ['LEAD del área', techLead],
    ['persona con dos áreas', techAndCyber],
    ['MEMBER de otra área', legalMember],
  ])('%s no puede sobre una nota ajena', (_label, session) => {
    expect(canEditTaskNote(session, noteBy('someone-else'))).toBe(false);
    expect(canRemoveTaskNote(session, noteBy('someone-else'))).toBe(false);
  });
});
