import { describe, expect, it } from 'vitest';
import { createDeptTask, moveDeptTask } from './dept-tasks';
import { extractTaskCodes, parsePullRequestPayload, type PullRequestEvent, syncPullRequest } from './github-sync';
import { TEST_NOW, makeTestStore, makeUser, sessionOf } from './test-utils';

function setup() {
  const techLead = makeUser({ departments: ['TECH'], role: 'LEAD' });
  const ctx = makeTestStore([], [techLead]);
  return { ...ctx, techLead };
}

const pr = (overrides: Partial<PullRequestEvent> = {}): PullRequestEvent => ({
  action: 'opened',
  repo: 'temotiva/app',
  number: 34,
  url: 'https://github.com/temotiva/app/pull/34',
  title: 'Login con Google',
  body: '',
  branch: 'feat/TEC-1-login',
  draft: false,
  merged: false,
  ...overrides,
});

describe('GitHub → tareas de Tech', () => {
  it('reconoce las claves en rama, título y descripción sin confundir otras', () => {
    expect(extractTaskCodes('feat/tec-12-login', 'Cierra TEC 3 y TEC_4', 'ver TEC-12')).toEqual(['TEC-12', 'TEC-3', 'TEC-4']);
    expect(extractTaskCodes('PROTEC-5', 'TEC-')).toEqual([]);
  });

  it('PR abierto → En revisión; fusionado → Hecha', async () => {
    const s = setup();
    const task = await createDeptTask(s.store, sessionOf(s.techLead), { title: 'Login', department: 'TECH', now: TEST_NOW });
    expect(await syncPullRequest(s.store, pr(), TEST_NOW)).toEqual({ updated: 1, unknown: 0 });
    expect(await s.store.deptTaskById(task.id)).toMatchObject({ status: 'REVIEW', pullRequest: { number: 34, state: 'OPEN' } });
    await syncPullRequest(s.store, pr({ action: 'closed', merged: true }), TEST_NOW);
    expect(await s.store.deptTaskById(task.id)).toMatchObject({ status: 'DONE', pullRequest: { state: 'MERGED' } });
  });

  it('borrador → En curso; cerrar sin fusionar devuelve a En curso', async () => {
    const s = setup();
    const task = await createDeptTask(s.store, sessionOf(s.techLead), { title: 'Login', department: 'TECH', now: TEST_NOW });
    await syncPullRequest(s.store, pr({ draft: true }), TEST_NOW);
    expect((await s.store.deptTaskById(task.id))?.status).toBe('DOING');
    await syncPullRequest(s.store, pr({ action: 'ready_for_review' }), TEST_NOW);
    expect((await s.store.deptTaskById(task.id))?.status).toBe('REVIEW');
    await syncPullRequest(s.store, pr({ action: 'closed' }), TEST_NOW);
    expect(await s.store.deptTaskById(task.id)).toMatchObject({ status: 'DOING', pullRequest: { state: 'CLOSED' } });
  });

  it('una tarea Hecha no retrocede y otro PR cerrado no pisa uno vivo', async () => {
    const s = setup();
    const task = await createDeptTask(s.store, sessionOf(s.techLead), { title: 'Login', department: 'TECH', now: TEST_NOW });
    await syncPullRequest(s.store, pr(), TEST_NOW);
    await syncPullRequest(s.store, pr({ number: 35, action: 'closed' }), TEST_NOW);
    expect(await s.store.deptTaskById(task.id)).toMatchObject({ status: 'REVIEW', pullRequest: { number: 34 } });

    await moveDeptTask(s.store, sessionOf(s.techLead), { taskId: task.id, status: 'DONE' });
    await syncPullRequest(s.store, pr({ number: 36 }), TEST_NOW);
    expect(await s.store.deptTaskById(task.id)).toMatchObject({ status: 'DONE', pullRequest: { number: 36 } });
  });

  it('ignora tareas archivadas, de otras áreas y claves inexistentes', async () => {
    const s = setup();
    expect(await syncPullRequest(s.store, pr({ branch: 'feat/TEC-99' }), TEST_NOW)).toEqual({ updated: 0, unknown: 1 });
    expect(await syncPullRequest(s.store, pr({ action: 'labeled' }), TEST_NOW)).toEqual({ updated: 0, unknown: 0 });
  });

  it('solo acepta payloads con forma de pull request de github.com', () => {
    expect(parsePullRequestPayload({})).toBeNull();
    expect(
      parsePullRequestPayload({ action: 'opened', repository: { full_name: 'a/b' }, pull_request: { number: 1, html_url: 'https://evil.example/x' } }),
    ).toBeNull();
    expect(
      parsePullRequestPayload({
        action: 'opened',
        repository: { full_name: 'a/b' },
        pull_request: { number: 1, html_url: 'https://github.com/a/b/pull/1', title: 'x', head: { ref: 'TEC-1' } },
      }),
    ).toMatchObject({ number: 1, branch: 'TEC-1', draft: false, merged: false });
  });
});
