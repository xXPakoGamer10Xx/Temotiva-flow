import { describe, expect, it } from 'vitest';
import { MAX_DEPARTMENT_REQUEST_DESCRIPTION, MAX_TASK_DESCRIPTION } from '@/domain/rules';
import { createDepartmentRequestSchema } from '@/server/actions/department-requests-schemas';
import { handleMcpMessage } from '@/server/mcp/handler';
import { createDepartmentRequest } from './department-requests';
import { createDeptTask } from './dept-tasks';
import { TEST_NOW, makeInitiative, makeTestStore, makeUser, sessionOf } from './test-utils';

/**
 * Spec 006 (RF-11, AC-12, P-6): descripciones largas. Una tarea admite 5 000
 * caracteres y una petición nueva del buzón también; con 5 001 las rechazan el
 * servicio, la herramienta MCP y el esquema de la acción.
 */

describe('descripción de una tarea de área (AC-12)', () => {
  function setup() {
    const lead = makeUser({ departments: ['CYBER'], role: 'LEAD' });
    const ctx = makeTestStore([makeInitiative()], [lead]);
    return { ...ctx, lead, session: sessionOf(lead) };
  }

  it('el servicio guarda 5 000 caracteres enteros y rechaza 5 001', async () => {
    const s = setup();
    const full = 'a'.repeat(MAX_TASK_DESCRIPTION);
    const task = await createDeptTask(s.store, s.session, { title: 'Informe largo', description: full, now: TEST_NOW });
    expect((await s.store.deptTaskById(task.id))?.description).toBe(full);

    await expect(
      createDeptTask(s.store, s.session, { title: 'Informe excesivo', description: `${full}a`, now: TEST_NOW }),
    ).rejects.toThrow(/descripción/i);
  });

  it('la herramienta MCP `crear_tarea` acepta 5 000 y rechaza 5 001 con un mensaje en español', async () => {
    const s = setup();
    const call = (description: string) =>
      handleMcpMessage(s.store, s.session, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'crear_tarea', arguments: { title: 'Desde el asistente', description } },
      });
    const result = (res: Awaited<ReturnType<typeof call>>) =>
      res?.result as { isError: boolean; content: { text: string }[] };

    expect(result(await call('b'.repeat(MAX_TASK_DESCRIPTION))).isError).toBe(false);

    const rejected = result(await call('b'.repeat(MAX_TASK_DESCRIPTION + 1)));
    expect(rejected.isError).toBe(true);
    expect(rejected.content[0]?.text).toMatch(/descripción admite hasta 5000 caracteres/);
    expect(await s.store.listDeptTasks()).toHaveLength(1);
  });
});

describe('descripción de una petición nueva del buzón (P-6)', () => {
  const legal = makeUser({ departments: ['LEGAL'], role: 'MEMBER' });
  const validCreate = (description: string) => ({
    sourceDepartment: 'LEGAL',
    targetDepartment: 'CYBER',
    helpType: 'VALIDATION',
    title: 'Revisión del cifrado de datos clínicos',
    description,
    blocksInitiative: false,
  }) as const;

  it('el esquema de la acción acepta 5 000 y rechaza 5 001 en español', () => {
    expect(createDepartmentRequestSchema.safeParse(validCreate('c'.repeat(MAX_DEPARTMENT_REQUEST_DESCRIPTION))).success).toBe(
      true,
    );
    const result = createDepartmentRequestSchema.safeParse(validCreate('c'.repeat(MAX_DEPARTMENT_REQUEST_DESCRIPTION + 1)));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/como máximo 5000 caracteres/);
  });

  it('el servicio también rechaza 5 001 aunque se llame sin pasar por la acción', async () => {
    const { store } = makeTestStore([makeInitiative()], [legal]);
    const input = { ...validCreate('d'.repeat(MAX_DEPARTMENT_REQUEST_DESCRIPTION)), now: TEST_NOW } as const;
    const created = await createDepartmentRequest(store, sessionOf(legal), input);
    expect(created.description).toHaveLength(MAX_DEPARTMENT_REQUEST_DESCRIPTION);

    await expect(
      createDepartmentRequest(store, sessionOf(legal), { ...input, description: `${input.description}d` }),
    ).rejects.toThrow(/como máximo 5000 caracteres/);
  });
});
